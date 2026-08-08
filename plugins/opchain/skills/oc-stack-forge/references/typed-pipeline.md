# Typed Pipeline Reference

Patterns for enforcing a unidirectional type chain from database to frontend. Two paths
covered: TypeScript-native (Hono + Drizzle) and cross-language (FastAPI + Pydantic → TS).

---

## Table of Contents

1. [TypeScript Path: Drizzle → Zod → OpenAPI → TS Types](#typescript-path)
2. [Python Path: SQLAlchemy → Pydantic → OpenAPI → TS Types](#python-path)
3. [OpenAPI Codegen Tools Compared](#openapi-codegen-tools)
4. [CI Enforcement Against Type Drift](#ci-enforcement)

---

## TypeScript Path

**Flow:** D1 schema → Drizzle models → Zod schemas → Hono OpenAPI → `openapi-typescript` → React

### Drizzle ORM + D1

Drizzle is the type-safe ORM for D1. Schema definitions produce TypeScript types directly.

```typescript
// src/db/schema.ts — Drizzle schema (source of truth)
import { sqliteTable, text, integer, sql } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Auto-generate Zod schemas from Drizzle schema
export const insertUserSchema = createInsertSchema(users, {
  email: (schema) => schema.email.email("Invalid email"),
  name: (schema) => schema.name.min(1, "Name required"),
});
export const selectUserSchema = createSelectSchema(users);

// Infer TypeScript types from Drizzle (used in app code)
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### Hono + Zod OpenAPI

`@hono/zod-openapi` generates an OpenAPI 3.1 spec from Zod schemas attached to routes.

```typescript
// src/routes/users.ts
import { createRoute, z } from "@hono/zod-openapi";
import { insertUserSchema, selectUserSchema } from "../db/schema";

const createUserRoute = createRoute({
  method: "post",
  path: "/users",
  request: {
    body: {
      content: { "application/json": { schema: insertUserSchema } },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: selectUserSchema } },
      description: "User created",
    },
    400: {
      content: { "application/json": { schema: errorSchema } },
      description: "Validation error",
    },
  },
});
```

```typescript
// src/index.ts — app setup with OpenAPI doc endpoint
import { OpenAPIHono } from "@hono/zod-openapi";

const app = new OpenAPIHono<{ Bindings: Env }>();

// Mount routes...
app.route("/oc-api", userRoutes);

// Serve OpenAPI spec
app.doc31("/openapi.json", {
  openapi: "3.1.0",
  info: { title: "My API", version: "1.0.0" },
});
```

### Frontend Codegen

```bash
# Generate TypeScript types from the OpenAPI spec
npx openapi-typescript http://localhost:8787/openapi.json -o src/lib/api/v1.d.ts
```

```typescript
// src/lib/api/client.ts — typed API client (6 KB runtime)
import createClient from "openapi-fetch";
import type { paths } from "./api/v1";

export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL });

// Usage — fully typed, autocomplete on path params, request body, and response
const { data, error } = await api.POST("/users", {
  body: { name: "Aidan", email: "aidan@example.com" },
});
// data is typed as User, error is typed as ErrorResponse
```

### Drizzle Migrations

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply to local D1
npx wrangler d1 migrations apply MY_DB --local

# Apply to remote D1
npx wrangler d1 migrations apply MY_DB --remote
```

Always review generated migrations — Drizzle Kit detects renames as drop + add (data loss).

---

## Python Path

**Flow:** PostgreSQL schema → SQLAlchemy `Mapped[]` → Pydantic v2 → FastAPI OpenAPI → `openapi-typescript` → React

Use this path when the backend is FastAPI (hosted on Cloud Run, Fly.io, or similar) and
Cloudflare handles frontend/CDN/KV only.

### SQLAlchemy 2.0 + Pydantic v2

Keep SQLAlchemy and Pydantic models separate for maximum control. The critical config is
`from_attributes=True` on response models.

```python
# models/user.py — SQLAlchemy (DB layer)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    orders: Mapped[list["Order"]] = relationship(lazy="raise")  # Prevents N+1
```

```python
# schemas/user.py — Pydantic v2 (API boundary)
from pydantic import BaseModel, ConfigDict

class UserBase(BaseModel):
    name: str
    email: str

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
```

**Key patterns:**
- `lazy="raise"` on ALL relationships — makes N+1 queries impossible, forces explicit eager loading
- Separate Create/Read/Update schemas — prevents leaking internal fields
- `model_dump(exclude_unset=True)` for PATCH — distinguishes "not sent" from "set to null"
- Avoid SQLModel for complex projects — limiting for hybrid properties and advanced relationships

### FastAPI OpenAPI Generation

FastAPI auto-generates OpenAPI 3.1 from Pydantic schemas. The spec endpoint is built in.

```python
# Export spec for codegen
# python -c "import json; from app.main import app; json.dump(app.openapi(), open('openapi.json','w'), indent=2)"
```

Same `openapi-typescript` codegen step as the TS path — the frontend doesn't care what language
the backend is.

### Alembic Migrations (Postgres path)

```python
# alembic/env.py — async config
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool

# Use NullPool for migrations
connectable = async_engine_from_config(
    config.get_section(config.config_ini_section),
    prefix="sqlalchemy.",
    poolclass=pool.NullPool,
)
```

Enable `compare_type=True` and `compare_server_default=True` for thorough autogeneration.
Use `alembic check` (1.12+) in CI to verify models match migration head.

**Breaking schema changes — three-phase approach:**
1. Add new column as nullable, deploy
2. Backfill data + switch reads to new column, deploy
3. Drop old column, deploy

---

## OpenAPI Codegen Tools

All three tools work with either backend path. Choose based on frontend needs.

| Tool | Runtime Size | React Query | MSW Mocks | Best For |
|---|---|---|---|---|
| openapi-typescript + openapi-fetch | 6 KB | Via plugin | No | Minimal overhead, aidops-scale apps |
| @hey-api/openapi-ts | Varies | Plugin | No | Full SDK generation, larger teams |
| Orval | Varies | Native | Yes (Faker.js) | TanStack Query + auto-generated test mocks |

**Default recommendation for aidops-scale:** `openapi-typescript` — smallest runtime, no
codegen bloat, types-only output. Add Orval if you need MSW mocks for testing.

### Package.json Scripts

```json
{
  "scripts": {
    "codegen:api": "openapi-typescript http://localhost:8787/openapi.json -o src/lib/api/v1.d.ts",
    "codegen:check": "npm run codegen:api && git diff --exit-code src/lib/api/v1.d.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## CI Enforcement

The type pipeline is only as strong as its enforcement. These CI steps ensure no layer drifts.

### GitHub Actions Workflow

```yaml
# .github/workflows/api-contract.yml
name: API Contract Check

on: [pull_request]

jobs:
  type-pipeline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # --- Backend: verify spec matches code ---
      - name: Generate fresh OpenAPI spec
        run: |
          # For Hono: start worker, fetch spec
          npx wrangler dev --local &
          sleep 3
          curl -s http://localhost:8787/openapi.json > openapi-fresh.json
          kill %1
          # For FastAPI:
          # python -c "import json; from app.main import app; json.dump(app.openapi(), open('openapi-fresh.json','w'), indent=2)"

      - name: Detect breaking API changes
        run: npx oasdiff breaking openapi.json openapi-fresh.json

      # --- Frontend: verify types match spec ---
      - name: Regenerate TypeScript types
        run: npx openapi-typescript openapi-fresh.json -o src/lib/api/v1.d.ts

      - name: TypeScript type check
        run: npx tsc --noEmit

      - name: Fail if generated types changed
        run: git diff --exit-code src/lib/api/v1.d.ts
```

### What This Catches

| Bug Category | How CI Catches It |
|---|---|
| Backend changes response shape | `oasdiff` flags breaking change |
| Frontend uses old field name | `tsc --noEmit` fails after type regen |
| New endpoint not typed | `git diff --exit-code` shows uncommitted type changes |
| Pydantic/Zod schema diverges from DB | Schemathesis contract tests (see testing-patterns.md) |

### Commit Strategy

Commit the OpenAPI spec (`openapi.json`) and generated types (`src/lib/api/v1.d.ts`) to the
repo. This makes changes visible in PRs and enables the `git diff --exit-code` check. The
CI pipeline regenerates both and fails if they don't match what's committed.
