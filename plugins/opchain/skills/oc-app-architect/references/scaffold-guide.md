# Scaffold Guide Reference

How to generate the initial project structure after spec approval. The scaffold must be immediately runnable after USER setup tasks.

---

## Principles

1. **Runs on first try.** After USER fills in .env, `npm run dev` works. No missing dependencies, no broken imports.
2. **Mirrors the architecture.** Directory structure matches what's in the architecture doc. No surprises.
3. **Minimal but complete.** Everything needed to start building features. No placeholder files with TODO comments.
4. **Environment-documented.** Every .env variable has a comment explaining what it is, where to get it, and which phase needs it.

---

## Scaffold Contents

Every scaffold includes:

| Item | Purpose |
|---|---|
| Directory structure | Matches architecture doc |
| `package.json` / `requirements.txt` | All dependencies with pinned versions |
| Config files | ESLint, Prettier, TypeScript, Tailwind, PostCSS |
| `.env.example` | Every variable documented (service, URL to get it, which phase) |
| Initial migration | Tables from the data model |
| Seed script | Realistic dev data (not Lorem ipsum) |
| Test setup | Vitest/Jest config, test utilities, first smoke test |
| CI pipeline | Lint → type check → test → build |
| `.gitignore` | node_modules, .env, .next, dist, coverage |
| `README.md` | Setup instructions (clone → install → env → db → run) |

---

## Stack: Next.js + Supabase (TypeScript)

```
project-name/
├── .github/
│   ├── workflows/ci.yml
│   └── PULL_REQUEST_TEMPLATE.md
├── public/
│   └── favicon.ico
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with providers
│   │   ├── page.tsx                # Home/landing
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   └── (dashboard)/
│   │       ├── layout.tsx          # Dashboard layout + sidebar
│   │       └── page.tsx
│   ├── components/
│   │   ├── ui/                     # Base components (shadcn or custom)
│   │   └── [feature]/              # Feature-specific components
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # Browser client
│   │   │   ├── server.ts           # Server client (RSC/API routes)
│   │   │   └── middleware.ts       # Auth middleware
│   │   ├── queries/                # Read operations (one file per entity)
│   │   ├── mutations/              # Write operations (one file per entity)
│   │   └── utils.ts
│   ├── hooks/
│   ├── types/
│   │   └── database.ts             # Auto-generated from Supabase
│   └── test/
│       ├── setup.ts                # Test globals, mocks
│       ├── factories/              # Data factory functions
│       └── utils.ts                # Render helpers, test utilities
├── supabase/
│   ├── migrations/
│   │   └── 20240101000000_initial_schema.sql
│   ├── seed.sql
│   └── config.toml
├── .env.example
├── .eslintrc.json
├── .gitignore
├── .prettierrc
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## Stack: React SPA + Express API

```
project-name/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── types/
│   │   ├── test/
│   │   │   ├── setup.ts
│   │   │   └── factories/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── server/
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── test/
│   │   │   ├── setup.ts
│   │   │   └── factories/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## Stack: Python (FastAPI + React)

```
project-name/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── endpoints/
│   │   │   └── router.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── security.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── main.py
│   ├── tests/
│   │   ├── conftest.py             # Fixtures, factories
│   │   └── factories/
│   ├── alembic/versions/
│   ├── requirements.txt
│   └── pyproject.toml
├── frontend/                        # Same as React SPA client/
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## .env.example Convention

Every variable gets three things: what it is, where to get it, and which phase needs it.

```bash
# ============================================================
# [App Name] Environment Variables
# Copy to .env and fill in values. Never commit .env.
# ============================================================

# --- Supabase (Phase 1) ---
# Get from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- Payments (Phase 3) ---
# Get from: https://dashboard.stripe.com/test/apikeys
# STRIPE_PUBLISHABLE_KEY=
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=

# --- Email (Phase 2) ---
# Get from: https://resend.com/api-keys
# RESEND_API_KEY=

# --- App Config ---
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

Commented-out variables = not needed until that phase. Uncomment when ready.

---

## Testing Infrastructure

### Test Setup (vitest.config.ts)
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

### Data Factories
Generate realistic test data without hardcoding:

```typescript
// src/test/factories/user.ts
let counter = 0;
export function buildUser(overrides = {}) {
  counter++;
  return {
    id: `user-${counter}`,
    email: `user${counter}@test.com`,
    display_name: `Test User ${counter}`,
    role: 'analyst',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
```

Use factories in tests: `const user = buildUser({ role: 'admin' })`.

### Mock Supabase Client
```typescript
// src/test/mocks/supabase.ts
export const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  })),
  auth: {
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
};
```

---

## Seed Data

Seed scripts populate the database with realistic development data. Not Lorem ipsum — use plausible names, dates, and quantities.

```sql
-- supabase/seed.sql
-- Dev seed data. Run with: npx supabase db reset

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com');

INSERT INTO profiles (id, display_name, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alice Chen', 'manager'),
  ('22222222-2222-2222-2222-222222222222', 'Bob Park', 'analyst');

-- Add 5-10 records for the primary entity so the app doesn't feel empty
INSERT INTO items (title, status, owner_id, created_at) VALUES
  ('Update CRM field mappings', 'in_progress', '22222222-2222-2222-2222-222222222222', now() - interval '3 days'),
  ('Add new lead source dropdown', 'submitted', '22222222-2222-2222-2222-222222222222', now() - interval '1 day');
```

---

## Development Workflow

### Git Branching
```
main              ← production-ready, deploy on merge
└── feature/T1.3-create-users-table   ← branch per task or small group of tasks
└── feature/T1.4-auth-flow
```

Branch naming: `feature/T[phase].[step]-short-description`

### Commit Convention
```
feat(T1.3): create users table migration
fix(T1.4): handle expired session redirect
chore: update dependencies
```

Prefix with task ID when applicable. Keep commits atomic — one concern per commit.

### PR Template
```markdown
## What
[One sentence: what this PR does]

## Task Reference
[T1.3, T1.4 — link to roadmap]

## How to Test
1. [Step-by-step verification]

## Screenshots
[If UI changes]
```

---

## Local Development

### Docker Compose (when needed)
Use when the stack includes services beyond what the BaaS provides (Redis, custom Postgres, etc.):

```yaml
# docker-compose.yml
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: app_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  pgdata:
```

For Supabase projects: use `npx supabase start` instead of Docker Compose. It runs Postgres, Auth, Storage, and Edge Functions locally.

### Available Scripts
Every scaffold includes these npm scripts:

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Start dev server with hot reload |
| `build` | `next build` | Production build |
| `start` | `next start` | Run production build |
| `lint` | `eslint . --ext .ts,.tsx` | Lint check |
| `format` | `prettier --write .` | Auto-format |
| `test` | `vitest` | Run tests (watch mode) |
| `test:ci` | `vitest run` | Run tests once (CI) |
| `db:migrate` | `supabase db push` | Apply migrations |
| `db:reset` | `supabase db reset` | Reset + re-seed |
| `db:types` | `supabase gen types typescript` | Regenerate TypeScript types |

---

## Post-Scaffold Smoke Test

After generating the scaffold, verify before handing to the user:

- [ ] `npm install` completes without errors
- [ ] `npm run dev` starts without errors
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] `npm run test` passes (even if only 1 smoke test)
- [ ] TypeScript compiles with no errors
- [ ] `.env.example` has every variable the code references
- [ ] `.gitignore` covers: node_modules, .env, .next, dist, coverage, .DS_Store
- [ ] README setup instructions are complete and accurate

---

## Platform-Specific Recipes (v1.3+)

The recipes below cover the four full-stack patterns added in v1.3's
platform-expansion sprint. Each recipe is self-contained: directory layout, the
key config files, the test command, the dev-loop command, and the deploy
hand-off to oc-deploy-ops. Consult `oc-stack-forge` "Platform Matrix" for when each
stack is the right pick.

### Django + Postgres + Render

**Layout:**
```
project/
├── manage.py
├── requirements.txt              # or pyproject.toml + uv lock
├── pytest.ini                    # rootdir = project; addopts = -ra
├── render.yaml                   # Render Blueprint: web service + Postgres
├── .env.example                  # DATABASE_URL, SECRET_KEY, DJANGO_SETTINGS_MODULE
├── core/
│   ├── settings/{base,dev,prod}.py
│   ├── urls.py
│   └── wsgi.py
└── apps/
    └── <feature>/
        ├── models.py
        ├── views.py
        ├── urls.py
        ├── tests/
        └── migrations/
```

**Key invariants:**
- Settings split into `base / dev / prod`; `DJANGO_SETTINGS_MODULE` env var
  picks the active one. Never have a single `settings.py` for both.
- `render.yaml` Blueprint provisions the Postgres + the web service together;
  Render reads it on first push. Subsequent deploys are pure git push.
- Postgres URL comes from `DATABASE_URL` env var; `dj-database-url` parses it
  in `prod.py`. No hardcoded credentials in any settings file.
- Tests use `pytest-django` (not `manage.py test`); `pytest.ini` points at the
  Django settings module via `DJANGO_SETTINGS_MODULE = core.settings.dev`.

**Dev loop:**
```
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

**Deploy:** `git push render main` after Blueprint provisioning; `oc-deploy-ops`
section "Render" has the audit-gate sequence. Render auto-runs migrations via
the `release` command in `render.yaml`.

### Rails + Postgres + Heroku

**Layout:**
```
project/
├── Gemfile
├── Gemfile.lock
├── Procfile                      # web: bundle exec puma; release: bundle exec rake db:migrate
├── app.json                      # Heroku review-apps + Postgres add-on declaration
├── .env                          # gitignored — use bin/dotenv in dev
├── config/
│   ├── application.rb
│   ├── database.yml
│   └── environments/{development,test,production}.rb
├── app/
│   ├── controllers/
│   ├── models/
│   └── views/
└── spec/                         # rspec-rails
```

**Key invariants:**
- Heroku Pipelines: review apps (per PR) → staging → prod. The pipeline is
  defined in `app.json`; review apps spin up automatically on PR open.
- `Procfile` `release:` step runs `db:migrate` on every deploy — never run
  migrations manually.
- Use `rspec-rails`, not Minitest, for v1.3 scaffolds (matches the existing
  scenario coverage and integrates more cleanly with oc-bug-check).
- Postgres URL from `DATABASE_URL`; Rails reads it natively via `database.yml`
  pointing at the env var.

**Dev loop:**
```
bundle install
bin/rails db:setup
bin/rails server
```

**Deploy:** `git push heroku main` — review apps are automatic per PR;
`oc-deploy-ops` "Heroku" section covers staging promotion + rollback.

### Go + Postgres + Fly.io

**Layout:**
```
project/
├── go.mod
├── go.sum
├── main.go                       # net/http or chi router; tiny — just wires deps
├── fly.toml                      # primary_region, internal_port, env, [[mounts]]
├── Dockerfile                    # multi-stage; final stage = distroless or scratch
├── .env.example                  # DATABASE_URL, PORT
├── internal/
│   ├── handlers/
│   ├── store/                    # sqlc-generated or hand-written queries
│   └── domain/
├── migrations/                   # plain .sql files; goose or atlas runs them
└── cmd/migrate/main.go           # standalone migrator binary
```

**Key invariants:**
- Two binaries from one go.mod: the web server (`./main.go`) and the migrator
  (`./cmd/migrate/`). The migrator runs in `fly.toml`'s `release_command`.
- Use `sqlc` (preferred) or hand-written SQL via `database/sql` —
  **avoid ORMs**. Go's strength is explicitness.
- Tests: stdlib `testing` + `testify/require`; integration tests use
  `dockertest` for ephemeral Postgres.
- `fly.toml` declares regional placement; opt for `primary_region = "ord"`
  (or wherever your users are) over edge-everywhere.

**Dev loop:**
```
go mod download
go run ./cmd/migrate up
go run .
```

**Deploy:** `fly deploy` — Fly's release_command runs migrations; `oc-deploy-ops`
"Fly.io" section has the audit gate + rollback (`fly releases list` →
`fly deploy --image <prior-tag>`).

### Rust + Axum + Postgres + Shuttle.rs

**Layout:**
```
project/
├── Cargo.toml
├── Cargo.lock
├── Shuttle.toml                  # name = "..."; (Shuttle reads infrastructure from main.rs)
├── .env.example                  # local-only; Shuttle manages secrets in prod
├── src/
│   ├── main.rs                   # #[shuttle_runtime::main] — declares Postgres + secrets
│   ├── handlers/
│   │   └── mod.rs
│   ├── domain/
│   │   └── mod.rs
│   └── store/
│       ├── mod.rs                # sqlx queries
│       └── migrations/           # sqlx-managed; .sql files run on boot
└── tests/                        # integration tests; Shuttle provides a test runtime
```

**Key invariants:**
- Shuttle's "infra in main.rs" model: Postgres provisioning is a
  `#[shuttle_shared_db::Postgres]` annotation in `main.rs`. No separate
  Terraform / Pulumi / dashboard config needed for the standard case.
- Use `axum` (not `actix-web`) for v1.3 scaffolds — Shuttle's first-party
  examples lean axum, and it composes better with `tower` middleware that
  the oc-integrations-engineer skill expects.
- Use `sqlx` (compile-time-checked queries) over `diesel` (heavier ORM).
  `sqlx::migrate!()` runs `.sql` files in `src/store/migrations/` on boot.
- `cargo test` runs integration tests against an ephemeral Postgres that
  Shuttle's test runtime provisions; no extra fixtures needed.

**Dev loop:**
```
cargo install cargo-shuttle
cargo shuttle login
cargo shuttle run                  # spawns local Shuttle runtime + Postgres
```

**Deploy:** `cargo shuttle deploy` — Shuttle reads `main.rs` for infra,
provisions Postgres + secrets on first deploy, hot-swaps the binary on
subsequent ones. `oc-deploy-ops` "Shuttle.rs" section covers staging via
project-aliasing + rollback (`cargo shuttle deployment list` →
`cargo shuttle deployment <id> redeploy`).

**Alt deploy (Fly.io):** if the team wants more infra control or already
runs other services on Fly, see the Go/Fly.io recipe — same `Dockerfile`
shape with `FROM rust:1.83-slim AS build` → `FROM gcr.io/distroless/cc-debian12`
final stage; `fly.toml` `release_command = ["./oc-migrate"]`.

---

## What NOT to Scaffold

- Placeholder files with TODO comments — write real code or don't create the file
- Components not needed in Phase 1
- Test files without actual tests
- Complex config for features not yet built
- Multiple environment configs — start with dev + prod, add staging when needed
