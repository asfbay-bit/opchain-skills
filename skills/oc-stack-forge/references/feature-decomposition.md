# Feature Decomposition for Cloudflare Stack

How to break a feature request into stack-ordered sprints for the tri-dev build loop.
This reference is for the **Planner agent** — read it when decomposing features that
target a Cloudflare-native stack (Workers, D1, KV, Pages).

---

## Table of Contents

1. [Sprint Ordering Principle](#sprint-ordering)
2. [Standard Feature Sprint Template](#sprint-template)
3. [Sprint Templates by Feature Type](#feature-type-templates)
4. [Evaluator Criteria Per Layer](#evaluator-criteria)

---

## Sprint Ordering Principle

Features are decomposed **bottom-up through the type pipeline**. Each sprint produces a
layer that the next sprint depends on. This order is non-negotiable because the typed
pipeline flows in one direction — DB is truth, everything downstream derives from it.

```
Sprint order (always):

  1. DB Layer             — Schema change + migration
  2. API Layer + Codegen  — Route + validation + OpenAPI + regenerate TS types
  3. Frontend Layer       — Component/hook using typed client
  4. Test Layer           — Contract test + unit tests + MSW handler
  5. CI Verification      — Confirm full pipeline passes

Exception: if the feature is frontend-only (no new data/API), start at Sprint 3.
Exception: if the feature is API-only (no UI), skip Sprint 3.
```

### Why This Order Matters

If you build frontend first, you're guessing at the API shape. If you build the API
first without the schema, you're guessing at the data model. Bottom-up means every
layer is built on verified ground truth, and the type codegen step (Sprint 3) catches
any mismatch between API and frontend before a line of frontend code is written.

---

## Standard Feature Sprint Template

Use this template when the Planner decomposes a feature. Adapt scope per sprint, but
keep the ordering.

### Sprint 1: DB Layer — `[feature] schema`
*(Hono: Drizzle + D1 | FastAPI: SQLAlchemy + Postgres — see FastAPI Path Substitutions below)*

**Deliverables:**
- Drizzle schema additions/modifications in `src/db/schema.ts`
- Generated migration file via `drizzle-kit generate`
- Migration applied locally (`wrangler d1 migrations apply --local`)
- Updated Zod schemas via `drizzle-zod` (insert + select)
- Exported TypeScript types (`$inferSelect`, `$inferInsert`)

**Technical approach:**
- Add tables/columns to the schema file
- Define relationships and constraints
- Generate and review migration (watch for rename-as-drop-add)
- Verify migration applies cleanly on empty DB and on existing data

**Contract criteria for Evaluator:**
- [ ] Schema compiles (`tsc --noEmit` passes)
- [ ] Migration runs without errors locally
- [ ] Zod schemas correctly derive from Drizzle schema (no manual overrides unless justified)
- [ ] Types are exported and importable from schema module
- [ ] If modifying existing tables: migration is non-destructive (no data loss)

---

### Sprint 2: API Layer + Type Codegen — `[feature] endpoints`
*(Hono: @hono/zod-openapi | FastAPI: Pydantic v2 + auto OpenAPI — see substitutions below)*

**Deliverables:**
- Hono route(s) using `@hono/zod-openapi` with request/response schemas
- Zod schemas for request body, path params, query params, response
- Error responses using the structured error pattern (`AppError`)
- OpenAPI spec auto-updated (verify via `/openapi.json` endpoint)
- Regenerated frontend TypeScript types from updated OpenAPI spec
- Committed updated `src/lib/api/v1.d.ts`

**Technical approach:**
- Define route(s) with `createRoute` and Zod schemas from Sprint 1
- Implement handler logic with proper error handling
- Use `getDb(c.env)` for database access
- Explicit eager loading for any joined queries (no lazy loading)
- After routes are working: run `npm run codegen:api` to regenerate TS types
- Run `tsc --noEmit` to verify no type errors in existing frontend code
- If existing frontend code breaks, document what needs updating in Sprint 3

**Contract criteria for Evaluator:**
- [ ] Route responds with correct status codes (200/201, 400, 404, 500)
- [ ] Request validation rejects bad input (test with malformed payloads)
- [ ] Response shape matches the Zod schema exactly
- [ ] OpenAPI spec at `/openapi.json` includes the new endpoint(s)
- [ ] Error responses use the standard `{ error: { code, message, details } }` shape
- [ ] No N+1 queries — all joins are explicit
- [ ] `openapi-typescript` runs without errors
- [ ] Generated TS types include the new endpoint paths and response types
- [ ] `tsc --noEmit` passes (or failures documented as Sprint 3 work)
- [ ] No hand-edits to the generated type file

---

### Sprint 3: Frontend Layer — `[feature] UI`

**Deliverables:**
- React component(s) or page(s) for the feature
- API calls using the typed `openapi-fetch` client
- Loading, error, and empty states handled
- Responsive layout (if applicable)

**Technical approach:**
- Use the typed API client (`api.GET`, `api.POST`, etc.) — never raw `fetch`
- Use TanStack Query hooks for data fetching (if project uses them)
- Handle all API error shapes using the standard error utilities
- Follow existing component patterns in the project

**Contract criteria for Evaluator:**
- [ ] Component renders without console errors
- [ ] API calls use the typed client (no raw fetch, no `any` types)
- [ ] Loading state shown while data fetches
- [ ] Error state shown when API returns error (not blank screen)
- [ ] Empty state shown when data is empty (not blank screen)
- [ ] No `any` or `@ts-ignore` in new code
- [ ] `tsc --noEmit` passes with the new components

---

### Sprint 4: Test Layer — `[feature] tests`
*(Hono: Vitest + Miniflare | FastAPI: pytest + transaction rollback — see substitutions below)*

**Deliverables:**
- Contract test: Schemathesis covers the new endpoint(s)
- Unit tests: Vitest tests for the API handler logic
- MSW handler: Mock for the new endpoint (for frontend tests)
- Frontend test: At least one component test using the MSW mock

**Technical approach:**
- Schemathesis runs against the full spec (no per-endpoint config needed — it auto-discovers)
- Vitest handler tests use Miniflare/Cloudflare test pool
- MSW handler returns realistic mock data matching the Zod schema
- Frontend test renders the component with the mock and verifies key elements

**Contract criteria for Evaluator:**
- [ ] Schemathesis finds no 500 errors on the new endpoint(s)
- [ ] At least one unit test per route handler (happy path + one error case)
- [ ] MSW handler matches the actual API response shape (verified against Zod schema)
- [ ] Frontend test passes and covers the primary user flow
- [ ] All existing tests still pass (no regressions)

---

### Sprint 5: CI Verification — `[feature] pipeline check`

**Deliverables:**
- Full pipeline passes: types regenerate clean, all tests pass, no type drift
- Any CI workflow updates if new tools/scripts were added

**Technical approach:**
- Run the full CI simulation locally:
  1. `npm run codegen:api` — types regenerate
  2. `git diff --exit-code src/lib/api/v1.d.ts` — no uncommitted type drift
  3. `tsc --noEmit` — type check passes
  4. `npx vitest run` — all tests pass
  5. Schemathesis contract check passes
- If CI workflow needs updates (new env vars, new test steps), update `.github/workflows/`

**Contract criteria for Evaluator:**
- [ ] Full pipeline simulation passes locally (all 5 checks above)
- [ ] No manual steps required — everything is scriptable/automatable
- [ ] CI workflow file updated if needed
- [ ] Feature is complete and demoable end-to-end

---

## Feature Type Templates

Not every feature needs all five sprints. Use these shortcuts:

### CRUD Feature (most common)
All five sprints. New table(s), new endpoint(s), new UI, new tests.

### API-Only Feature (webhook, background job, internal endpoint)
Sprints 1 → 2 → 4 → 5. Skip Sprint 3 (no UI).

### Frontend-Only Feature (UI change, new view of existing data)
Sprints 3 → 4 → 5. Skip DB/API layers. Run codegen in Sprint 3 only if the
frontend needs types from an endpoint it wasn't using before.

### Schema Migration (add column, rename, restructure)
Sprints 1 → 2 (update API if response shape changes) → 4 → 5. Sprint 3 only
if the UI displays the changed field.

### Config/Feature Flag
Sprint 1 (KV entry) → Sprint 2 (API to read/toggle) → Sprint 3 (UI toggle) → Sprint 4 → Sprint 5.

---

## FastAPI Path Substitutions

The sprint template above uses Hono/Drizzle terminology. When the project uses FastAPI
(Python backend), substitute these equivalents. The sprint *order* and *evaluator criteria*
are identical — only the tooling changes.

| Sprint | Hono/Drizzle | FastAPI/SQLAlchemy |
|---|---|---|
| 1: DB | Drizzle schema + `drizzle-kit generate` + `wrangler d1 migrations apply` | SQLAlchemy `Mapped[]` model + `alembic revision --autogenerate` + `alembic upgrade head` |
| 1: Validation | `drizzle-zod` auto-generated Zod schemas | Separate Pydantic v2 schemas with `ConfigDict(from_attributes=True)` |
| 1: Types | `$inferSelect` / `$inferInsert` | Pydantic model classes are the types |
| 2: Route | `@hono/zod-openapi` `createRoute` | FastAPI `@router.post` with Pydantic request/response models |
| 2: DB access | `getDb(c.env)` with Drizzle queries | `async with session` via dependency injection |
| 2: N+1 prevention | Drizzle explicit joins | `lazy="raise"` on all relationships + `selectinload`/`joinedload` |
| 2: Codegen | `npm run codegen:api` (same — `openapi-typescript` works with any OpenAPI spec) | `python -c "from app.main import app; ..."` then `npm run codegen:api` |
| 4: Contract tests | Schemathesis against Worker URL | Schemathesis via `from_asgi("/openapi.json", app)` |
| 4: Unit tests | Vitest + Miniflare/CF test pool | pytest + async transaction rollback |
| 5: CI | `wrangler dev --local` for spec export | FastAPI spec export script |

---

## Evaluator: Cross-Sprint Checks

After every sprint passes individually, the Evaluator should also verify these
cross-cutting concerns before marking the feature complete. Reference the typed-pipeline
and error-handling docs to verify patterns match.

### Typed Pipeline Integrity (ref: `references/typed-pipeline.md`)
- DB schema is the sole source of truth — no Zod/Pydantic schemas that don't derive from ORM
- OpenAPI spec is auto-generated — no hand-edits
- Frontend types are auto-generated — no hand-edits to `v1.d.ts`
- Every type in the chain can be traced: schema → validation → OpenAPI → TS types → component

### Error Handling Consistency (ref: `references/error-handling.md`)
- All new endpoints use the standard `AppError` hierarchy
- Frontend handles errors using the standard error utilities
- No swallowed errors (catch blocks that do nothing)
- CORS middleware ordering is correct (outermost)

### No Regressions
- All pre-existing tests still pass
- No new `any` types introduced
- No new `@ts-ignore` or `eslint-disable` comments
- No console.log left in production code (structured logger only)
