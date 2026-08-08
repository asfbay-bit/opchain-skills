# Instrumentation Patterns

Structured logging, error capture, and request monitoring middleware for each supported
stack. The SKILL.md describes WHAT to instrument; this file provides the code.

---

## Cloudflare Workers (Hono)

### Structured Logger

```typescript
// src/lib/logger.ts
interface LogContext {
  requestId: string;
  method: string;
  path: string;
  userId?: string;
  [key: string]: unknown;
}

export function createLogger(ctx: LogContext) {
  const base = { ...ctx, service: "app-name", env: "production" };
  return {
    info: (msg: string, extra?: Record<string, unknown>) =>
      console.log(JSON.stringify({ level: "info", msg, ...base, ...extra, ts: Date.now() })),
    warn: (msg: string, extra?: Record<string, unknown>) =>
      console.warn(JSON.stringify({ level: "warn", msg, ...base, ...extra, ts: Date.now() })),
    error: (msg: string, err?: Error, extra?: Record<string, unknown>) =>
      console.error(JSON.stringify({
        level: "error", msg,
        error: err ? { name: err.name, message: err.message, stack: err.stack } : undefined,
        ...base, ...extra, ts: Date.now(),
      })),
  };
}
```

### Request Monitoring Middleware

```typescript
// src/middleware/monitoring.ts
import { createMiddleware } from "hono/factory";
import { createLogger } from "../lib/logger";
import { captureException } from "../lib/sentry";

export const requestMonitoring = createMiddleware(async (c, next) => {
  const requestId = crypto.randomUUID();
  const start = performance.now();

  const logger = createLogger({
    requestId,
    method: c.req.method,
    path: c.req.path,
  });

  c.set("requestId", requestId);
  c.set("logger", logger);
  c.header("X-Request-Id", requestId);

  try {
    await next();
  } catch (err) {
    const duration = performance.now() - start;
    logger.error("Unhandled error", err as Error, { duration_ms: Math.round(duration) });

    // Send to Sentry if configured
    if (c.env.SENTRY_DSN) {
      await captureException(err as Error, { requestId, path: c.req.path }, c.env);
    }

    throw err;
  }

  const duration = performance.now() - start;
  const status = c.res.status;

  logger.info("request", {
    status,
    duration_ms: Math.round(duration),
    ...(duration > 1000 ? { slow: true } : {}),
    ...(status >= 500 ? { server_error: true } : {}),
  });
});
```

### Sentry Transport (Workers-Compatible)

Workers can't use the Sentry SDK directly (it expects Node.js). Use a lightweight
HTTP transport:

```typescript
// src/lib/sentry.ts
export async function captureException(
  err: Error,
  context: Record<string, unknown>,
  env: Env
) {
  if (!env.SENTRY_DSN) return;

  // Parse DSN: https://{key}@{host}/{project_id}
  const dsn = new URL(env.SENTRY_DSN);
  const key = dsn.username;
  const projectId = dsn.pathname.replace("/", "");
  const sentryUrl = `https://${dsn.host}/api/${projectId}/store/`;

  const payload = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level: "error",
    server_name: "cloudflare-worker",
    environment: env.ENVIRONMENT || "production",
    exception: {
      values: [{
        type: err.name,
        value: err.message,
        stacktrace: err.stack ? { frames: parseStack(err.stack) } : undefined,
      }],
    },
    tags: context,
  };

  // Fire and forget — don't let Sentry failure break the app
  // In production, use ctx.waitUntil(fetch(...)) to avoid blocking the response.
  // The await here is for clarity; replace with waitUntil in your Worker's fetch handler.
  try {
    await fetch(sentryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=oc-monitoring-ops/1.0`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    console.error("Sentry transport failed");
  }
}

function parseStack(stack: string): Array<{ filename: string; lineno: number; function: string }> {
  return stack.split("\n").slice(1).map(line => {
    const match = line.match(/at (\S+) \((.+):(\d+):\d+\)/);
    return match ? { function: match[1], filename: match[2], lineno: parseInt(match[3]) }
                 : { function: "?", filename: line.trim(), lineno: 0 };
  }).reverse();
}
```

### Middleware Registration Order

```typescript
// src/index.ts
const app = new OpenAPIHono<{ Bindings: Env }>();

// 1. CORS (outermost)
app.use("*", cors({ /* config */ }));

// 2. Monitoring (request ID, logging, timing)
app.use("*", requestMonitoring);

// 3. Auth
app.use("/api/*", authMiddleware);

// 4. Routes
app.route("/oc-api", routes);

// 5. Error handler (catches anything monitoring middleware re-throws)
app.onError(errorHandler);
```

---

## Next.js / Vercel

### Structured Logger

```typescript
// lib/logger.ts
export function createLogger(context: Record<string, unknown> = {}) {
  const base = { service: "app-name", ...context };
  return {
    info: (msg: string, extra?: Record<string, unknown>) =>
      console.log(JSON.stringify({ level: "info", msg, ...base, ...extra, ts: Date.now() })),
    warn: (msg: string, extra?: Record<string, unknown>) =>
      console.warn(JSON.stringify({ level: "warn", msg, ...base, ...extra, ts: Date.now() })),
    error: (msg: string, err?: Error, extra?: Record<string, unknown>) =>
      console.error(JSON.stringify({
        level: "error", msg,
        error: err ? { name: err.name, message: err.message, stack: err.stack } : undefined,
        ...base, ...extra, ts: Date.now(),
      })),
  };
}
```

### Sentry Integration

```bash
npx @sentry/wizard@latest -i nextjs
```

Sentry's Next.js SDK handles: error boundaries, API route errors, middleware errors,
and server component errors. No custom transport needed.

### Middleware (Edge)

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const response = NextResponse.next();
  response.headers.set("X-Request-Id", requestId);
  return response;
}
```

---

## FastAPI (Python)

### Structured Logger

```python
# lib/logger.py
import structlog
import logging

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()
```

### Request Middleware

```python
# middleware/monitoring.py
import time
import uuid
import structlog
from starlette.middleware.base import BaseHTTPMiddleware

class MonitoringMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = str(uuid.uuid4())
        start = time.monotonic()

        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        try:
            response = await call_next(request)
        except Exception as exc:
            duration = (time.monotonic() - start) * 1000
            structlog.get_logger().error(
                "unhandled_error",
                error=str(exc),
                duration_ms=round(duration),
            )
            raise

        duration = (time.monotonic() - start) * 1000
        structlog.get_logger().info(
            "request",
            status=response.status_code,
            duration_ms=round(duration),
            slow=duration > 1000,
        )

        response.headers["X-Request-Id"] = request_id
        return response
```

### Sentry Integration

```bash
pip install sentry-sdk[fastapi]
```

```python
# main.py
import sentry_sdk

sentry_sdk.init(
    dsn=settings.SENTRY_DSN,
    environment=settings.ENVIRONMENT,
    traces_sample_rate=0.1,  # 10% of requests traced
)
```

---

## Health Endpoint Patterns

### Minimal (T0)

```typescript
app.get("/api/health", (c) => c.json({ status: "ok" }, 200));
```

### Standard (T1)

```typescript
app.get("/api/health", async (c) => {
  const checks: Record<string, "ok" | "degraded" | "down"> = {};

  try {
    await c.env.DB.prepare("SELECT 1").first();
    checks.database = "ok";
  } catch { checks.database = "down"; }

  const overall = Object.values(checks).includes("down") ? "unhealthy" : "ok";
  return c.json({ status: overall, checks, version: c.env.VERSION || "unknown",
    timestamp: new Date().toISOString() }, overall === "ok" ? 200 : 503);
});
```

### Comprehensive (T2+)

```typescript
app.get("/api/health", async (c) => {
  const checks: Record<string, { status: string; latency_ms?: number; detail?: string }> = {};
  const start = performance.now();

  // Database
  try {
    const dbStart = performance.now();
    await c.env.DB.prepare("SELECT 1").first();
    checks.database = { status: "ok", latency_ms: Math.round(performance.now() - dbStart) };
  } catch (e: any) {
    checks.database = { status: "down", detail: e.message };
  }

  // KV
  try {
    const kvStart = performance.now();
    await c.env.CACHE.get("__health");
    checks.kv = { status: "ok", latency_ms: Math.round(performance.now() - kvStart) };
  } catch (e: any) {
    checks.kv = { status: "down", detail: e.message };
  }

  // External dependency (if critical)
  // try { ... } catch { ... }

  const statuses = Object.values(checks).map(c => c.status);
  const overall = statuses.includes("down") ? "unhealthy" :
                  statuses.includes("degraded") ? "degraded" : "healthy";

  return c.json({
    status: overall,
    checks,
    version: c.env.VERSION || "unknown",
    uptime_seconds: Math.round(performance.now() / 1000),
    timestamp: new Date().toISOString(),
  }, overall === "healthy" ? 200 : 503);
});
```

---

## Log Context Propagation

Every log entry should include enough context to trace a request end-to-end:

| Field | Source | Required at Tier |
|---|---|---|
| `requestId` | Generated per request | T0+ |
| `method` | HTTP method | T0+ |
| `path` | Request path | T0+ |
| `status` | Response status code | T0+ |
| `duration_ms` | Request duration | T0+ |
| `userId` | Auth session | T1+ |
| `service` | App/service name | T1+ (multi-service) |
| `env` | production/staging | T1+ |
| `version` | Deployed version | T1+ |
| `traceId` | Distributed trace | T3 |
