# Error Handling & Logging Reference

Structured error handling, middleware ordering, and logging patterns for Cloudflare Workers
(Hono) and FastAPI. Ensures the frontend always receives a consistent error shape.

---

## Table of Contents

1. [Consistent Error Shape](#error-shape)
2. [Hono Error Handling](#hono-errors)
3. [FastAPI Error Handling](#fastapi-errors)
4. [Middleware Ordering](#middleware-ordering)
5. [Structured Logging](#structured-logging)
6. [CORS Pitfalls](#cors-pitfalls)

---

## Consistent Error Shape

Both backend paths should return errors in the same shape so the frontend has one
error-handling pattern regardless of backend language.

```typescript
// Shared error contract (matches OpenAPI error schema)
interface ApiError {
  error: {
    code: string;        // Machine-readable: "VALIDATION_ERROR", "NOT_FOUND", "UNAUTHORIZED"
    message: string;     // Human-readable: "Email is required"
    details?: Record<string, unknown>;  // Optional structured context
  };
}
```

The frontend API client can then have a single error handler:

```typescript
// src/lib/api/errors.ts
export function getErrorMessage(error: ApiError): string {
  return error.error.message;
}

export function isErrorCode(error: ApiError, code: string): boolean {
  return error.error.code === code;
}
```

---

## Hono Error Handling

### Custom Error Class

```typescript
// src/lib/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

// Convenience constructors
export const NotFound = (resource: string) =>
  new AppError("NOT_FOUND", `${resource} not found`, 404);

export const Unauthorized = (reason?: string) =>
  new AppError("UNAUTHORIZED", reason ?? "Authentication required", 401);

export const Forbidden = (reason?: string) =>
  new AppError("FORBIDDEN", reason ?? "Insufficient permissions", 403);

export const ValidationError = (details: Record<string, unknown>) =>
  new AppError("VALIDATION_ERROR", "Validation failed", 400, details);
```

### Global Error Handler

```typescript
// src/middleware/error-handler.ts
import { ErrorHandler } from "hono";
import { AppError } from "../lib/errors";
import { ZodError } from "zod";

export const errorHandler: ErrorHandler<Env> = (err, c) => {
  // Known application errors
  if (err instanceof AppError) {
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.statusCode as any
    );
  }

  // Zod validation errors (from @hono/zod-openapi)
  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: { issues: err.issues },
        },
      },
      400
    );
  }

  // Unknown errors — log full error, return generic message
  console.error("Unhandled error:", err);
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    500
  );
};
```

```typescript
// src/index.ts — register error handler
const app = new OpenAPIHono<{ Bindings: Env }>();
app.onError(errorHandler);
```

### Using Errors in Routes

```typescript
app.openapi(getUserRoute, async (c) => {
  const { id } = c.req.valid("param");
  const db = getDb(c.env);

  const user = await db.select().from(users).where(eq(users.id, id)).get();
  if (!user) throw NotFound("User");

  return c.json(user, 200);
});
```

---

## FastAPI Error Handling

### Custom Exception Hierarchy

```python
# app/errors.py
class AppException(Exception):
    def __init__(
        self,
        message: str,
        code: str,
        status_code: int = 400,
        details: dict | None = None,
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}

class NotFoundException(AppException):
    def __init__(self, resource: str):
        super().__init__(f"{resource} not found", "NOT_FOUND", 404)

class UnauthorizedException(AppException):
    def __init__(self, reason: str = "Authentication required"):
        super().__init__(reason, "UNAUTHORIZED", 401)
```

### Global Exception Handler

```python
# app/main.py
from fastapi.responses import JSONResponse

@app.exception_handler(AppException)
async def handle_app_error(request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )

@app.exception_handler(Exception)
async def handle_unexpected_error(request, exc: Exception):
    logger.exception("Unhandled error")
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
            }
        },
    )
```

---

## Middleware Ordering

Middleware runs in reverse order of addition (Starlette/Hono both follow this pattern).

### Hono Ordering

```typescript
// Order matters — first added = outermost = runs first on request, last on response
// 1. CORS (outermost — must wrap everything including error responses)
app.use("*", cors({
  origin: ["https://oc-app.aidops.dev"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// 2. Request ID tracking
app.use("*", requestId());

// 3. Logging
app.use("*", logger());

// 4. Auth (innermost)
app.use("/api/*", authMiddleware);
```

### FastAPI Ordering

```python
# 1. CORS (outermost — added first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://oc-app.aidops.dev"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# 2. Request ID
app.add_middleware(CorrelationIdMiddleware)
# 3. Auth
app.add_middleware(AuthMiddleware)
```

### Why CORS Must Be Outermost

If an inner middleware (auth, rate limiting) throws an error, the error response needs
CORS headers. If CORS middleware doesn't wrap the error handler, the browser sees a
response without `Access-Control-Allow-Origin` and reports it as a CORS error — hiding
the real error from the developer.

---

## Structured Logging

### Hono (Workers)

Workers have `console.log` which goes to `wrangler tail` and Cloudflare dashboard.
For structured logging, use JSON:

```typescript
// src/lib/logger.ts
interface LogContext {
  requestId?: string;
  method?: string;
  path?: string;
  userId?: string;
  [key: string]: unknown;
}

export function createLogger(baseContext: LogContext = {}) {
  return {
    info: (message: string, extra?: Record<string, unknown>) =>
      console.log(JSON.stringify({ level: "info", message, ...baseContext, ...extra })),
    warn: (message: string, extra?: Record<string, unknown>) =>
      console.warn(JSON.stringify({ level: "warn", message, ...baseContext, ...extra })),
    error: (message: string, error?: Error, extra?: Record<string, unknown>) =>
      console.error(JSON.stringify({
        level: "error", message,
        error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
        ...baseContext, ...extra,
      })),
  };
}
```

```typescript
// Middleware to create per-request logger
app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("logger", createLogger({
    requestId,
    method: c.req.method,
    path: c.req.path,
  }));
  c.header("X-Request-Id", requestId);
  await next();
});
```

### FastAPI (structlog)

```python
import structlog

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),  # JSON for production
    ],
)

logger = structlog.get_logger()

# In middleware: bind request context
structlog.contextvars.bind_contextvars(
    request_id=request_id,
    method=request.method,
    path=request.url.path,
)
```

---

## CORS Pitfalls

Three rules that prevent every common CORS bug:

1. **Never use `allow_origins=["*"]` with `allow_credentials=True`** — browsers silently
   reject this combination. Every request appears as a CORS error with no useful info.
   List specific origins.

2. **CORS middleware must be outermost** — see Middleware Ordering section above.

3. **Workers/Cloud Run IAM + CORS:** If using platform-level auth (CF Access, Cloud Run IAM),
   preflight OPTIONS requests get rejected with 403 because browsers don't send auth headers
   on preflight. Handle auth in application code instead, or explicitly allow OPTIONS without auth.
