# Testing Patterns Reference

Testing pyramid and tooling for Cloudflare-native and FastAPI-backed apps. Scaled for
solo/small-team projects — pragmatic coverage, not enterprise ceremony.

---

## Table of Contents

1. [Testing Pyramid for Small-Scale Apps](#testing-pyramid)
2. [Contract Testing with Schemathesis](#contract-testing)
3. [Backend Unit/Integration Tests](#backend-tests)
4. [Frontend Tests: Vitest + MSW + Playwright](#frontend-tests)
5. [CI Pipeline Structure](#ci-pipeline)

---

## Testing Pyramid

| Level | Ratio | Tools (Hono Path) | Tools (FastAPI Path) | What It Catches |
|---|---|---|---|---|
| Contract | Run on every PR | Schemathesis via URL or Miniflare | Schemathesis via ASGI | API spec violations, edge-case 500s |
| Unit | ~60% | Vitest | pytest + transaction rollback | Logic bugs, data transforms |
| Integration | ~25% | Vitest + MSW | pytest + testcontainers | API call flows, DB interactions |
| E2E | ~15% | Playwright | Playwright | User flows, visual regression |

**For aidops-scale apps:** Start with contract tests + unit tests. Add E2E only for
critical user flows (auth, data entry, payment). You don't need 90% coverage on a
2-user app — you need confidence in the happy path and the error path.

---

## Contract Testing with Schemathesis

Schemathesis (4.x, MIT, Python ≥ 3.10) auto-generates edge-case inputs from your OpenAPI
spec using Hypothesis-based property testing. It finds bugs you'd never write tests for.

### For Hono (Workers) — Test Against Running Worker

```bash
# Start local worker
npx wrangler dev --local &

# Run contract tests against it
schemathesis run http://localhost:8787/openapi.json \
  --checks all \
  --stateful=links \
  --hypothesis-max-examples=100
```

### For FastAPI — Test Against ASGI App Directly

```python
# tests/test_contract.py
import schemathesis
from app.main import app

schema = schemathesis.openapi.from_asgi("/openapi.json", app)

@schema.parametrize()
def test_api_contract(case):
    case.call_and_validate()
```

### What Schemathesis Catches

- 500 errors on unexpected inputs (malformed strings, boundary values, empty bodies)
- Response schema violations (API returns fields not in spec)
- Validation bypasses (inputs that should be rejected but aren't)
- Stateful bugs (create → read → update → delete sequences that fail)
- Negative testing (v4): verifies API properly rejects invalid data

### Schemathesis in CI

```yaml
- name: Contract tests
  run: |
    pip install schemathesis
    npx wrangler dev --local &
    sleep 3
    schemathesis run http://localhost:8787/openapi.json --checks all
    kill %1
```

---

## Backend Tests

### Hono Path: Vitest + Miniflare

Miniflare simulates the Workers runtime locally. Test handlers directly without HTTP.

```typescript
// tests/users.test.ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";

describe("POST /api/users", () => {
  it("creates a user with valid input", async () => {
    const res = await app.request("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", email: "test@example.com" }),
    }, env);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Test");
    expect(data.id).toBeDefined();
  });

  it("rejects invalid email", async () => {
    const res = await app.request("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", email: "not-an-email" }),
    }, env);

    expect(res.status).toBe(400);
  });
});
```

```typescript
// vitest.config.ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          d1Databases: ["MY_DB"],
        },
      },
    },
  },
});
```

### FastAPI Path: pytest + Transaction Rollback

Each test runs in a SAVEPOINT that rolls back — clean DB without teardown cost.

```python
# conftest.py
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from httpx import ASGITransport, AsyncClient

async_engine = create_async_engine(DATABASE_URL, poolclass=NullPool)

@pytest_asyncio.fixture(scope="function")
async def db_session():
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_maker = async_sessionmaker(
        bind=async_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_maker() as session:
        await session.begin()
        yield session
        await session.rollback()

@pytest_asyncio.fixture(scope="function")
async def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c
    app.dependency_overrides.clear()
```

**Key patterns:**
- `NullPool` in tests — prevents connection leaks across function-scoped fixtures
- `expire_on_commit=False` — prevents DetachedInstanceError after commit
- `dependency_overrides` instead of monkeypatching — cleaner, purpose-built
- Set `asyncio_mode = "auto"` in pyproject.toml to skip `@pytest.mark.asyncio` decorators

---

## Frontend Tests

### Vitest + React Testing Library

Vitest (3.x) is the standard for React/TypeScript in 2025-2026. 4x+ faster than Jest,
native ESM/TypeScript, shared Vite config.

```typescript
// src/components/UserList.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserList } from "./UserList";

// Fresh QueryClient per test — prevents shared state between tests
const createTestClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

it("renders users from API", async () => {
  render(
    <QueryClientProvider client={createTestClient()}>
      <UserList />
    </QueryClientProvider>
  );
  await waitFor(() => {
    expect(screen.getByText("Aidan")).toBeInTheDocument();
  });
});
```

**Known issue:** Avoid `vi.useFakeTimers()` with TanStack Query — queries never resolve.

### MSW v2 — Network Mocking

Reusable handlers across Vitest, Playwright, and Storybook.

```typescript
// src/mocks/handlers.ts
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/users", () =>
    HttpResponse.json([
      { id: 1, name: "Aidan", email: "aidan@example.com" },
    ])
  ),
  http.post("/api/users", async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 2, ...body }, { status: 201 });
  }),
];
```

```typescript
// src/mocks/setup.ts — for Vitest
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);

// In vitest.setup.ts:
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Playwright — E2E

Use only for critical user flows. Keep the E2E suite small and fast.

```typescript
// e2e/auth.spec.ts
import { test, expect } from "@playwright/test";

test("user can log in and see dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill("test@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

// Visual regression — single line
test("dashboard looks correct", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveScreenshot("dashboard.png");
});
```

**Key patterns:**
- Role-based locators (`getByRole`) — resilient to markup changes
- `storageState` for authenticated sessions — login once, reuse across tests
- `webServer` config to auto-start dev server

---

## CI Pipeline Structure

The full CI pipeline (test + deploy) lives in `references/cf-deployment.md` § CI/CD Pipeline.
Below is the test-only subset — use this when adding testing to a project that already has
its own deploy pipeline, or when cf-deployment.md handles the deploy steps separately.

```yaml
# .github/workflows/test.yml (test-only — see cf-deployment.md for full deploy pipeline)
name: Test Suite

on: [pull_request]

jobs:
  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: pip install schemathesis
      - run: |
          npx wrangler dev --local &
          sleep 3
          schemathesis run http://localhost:8787/openapi.json --checks all
          kill %1

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx vitest run --coverage
      - run: npx tsc --noEmit

  e2e-tests:
    needs: [contract-tests, unit-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
```

**For aidops-scale apps:** Start with just contract-tests + unit-tests. Add E2E only when
you have auth or multi-step flows that are hard to test at lower levels.
