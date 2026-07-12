# Migration Playbooks

Type-specific step templates, verification patterns, and rollback procedures. The
SKILL.md defines the framework; this file provides the tactical playbooks.

---

## Database Migration Playbook

### D1 (SQLite) → Postgres (Supabase / Neon)

The most common database migration in the aidops ecosystem. D1 is perfect for <100
users; Postgres scales further and adds features (full-text search, LISTEN/NOTIFY,
advanced types, row-level security with fine-grained policies).

#### Pre-Migration Checklist

- [ ] D1 database backed up (`wrangler d1 export <db-name> --remote --output backup.sql`)
- [ ] Target Postgres instance created (Supabase project or Neon database)
- [ ] Connection string available and tested
- [ ] ORM supports target dialect (Drizzle supports both; if using raw SQL, audit all queries)
- [ ] All tests pass on current system (baseline)
- [ ] Row counts captured per table (for verification)

#### Schema Translation Notes

| SQLite (D1) | Postgres | Migration Action |
|---|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL` or `uuid DEFAULT gen_random_uuid()` | Convert in schema |
| `TEXT` for dates | `TIMESTAMPTZ` | Convert + validate date formats in data |
| `TEXT` for JSON | `JSONB` | Direct transfer; Postgres adds indexing and query capabilities |
| `REAL` | `DOUBLE PRECISION` or `NUMERIC` | Check precision requirements |
| No native `BOOLEAN` | `BOOLEAN` | Convert 0/1 integers to true/false |
| No `ENUM` type | `CREATE TYPE ... AS ENUM (...)` | Create enum types, migrate text values |
| `GLOB` / `LIKE` (case-sensitive) | `ILIKE` (case-insensitive) / `LIKE` (case-sensitive) | Audit query patterns |
| No native arrays | `ARRAY` types | Restructure if using JSON arrays for list data |

#### Drizzle ORM Dialect Swap

```typescript
// BEFORE (D1)
import { drizzle } from "drizzle-orm/d1";
export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}

// AFTER (Postgres via Supabase)
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
export function getDb(env: Env) {
  const client = postgres(env.DATABASE_URL);
  return drizzle(client, { schema });
}
```

Schema file changes:
```typescript
// BEFORE: import from sqlite-core
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// AFTER: import from pg-core
import { pgTable, text, integer, timestamp, boolean, uuid } from "drizzle-orm/pg-core";
```

#### Data Migration Script Pattern

```typescript
// migrations/scripts/d1-to-postgres.ts
import { D1Database } from "@cloudflare/workers-types";

interface MigrationConfig {
  sourceDb: D1Database;        // D1 binding
  targetUrl: string;           // Postgres connection string
  batchSize: number;           // Rows per batch (default: 500)
  tables: string[];            // Ordered by foreign key dependencies
  transformers: Record<string, (row: any) => any>;  // Per-table data transforms
}

async function migrateTable(config: MigrationConfig, table: string) {
  const transformer = config.transformers[table] || ((r: any) => r);
  let offset = 0;
  let migrated = 0;

  while (true) {
    // Read batch from D1
    const { results } = await config.sourceDb
      .prepare(`SELECT * FROM ${table} LIMIT ${config.batchSize} OFFSET ${offset}`)
      .all();

    if (!results.length) break;

    // Transform (type conversions, date formats, etc.)
    const transformed = results.map(transformer);

    // Write batch to Postgres
    await insertBatch(config.targetUrl, table, transformed);

    migrated += results.length;
    offset += config.batchSize;

    // Progress log
    console.log(`  ${table}: ${migrated} rows migrated`);
  }

  return migrated;
}

// Example transformer: SQLite integer booleans → Postgres booleans
const transformers = {
  users: (row: any) => ({
    ...row,
    is_active: Boolean(row.is_active),
    created_at: new Date(row.created_at).toISOString(),
  }),
};
```

#### Dual-Write Pattern (D1 + Postgres)

For HIGH-risk migrations, run both databases simultaneously:

```typescript
// middleware/dual-write.ts
export async function dualWrite(
  d1Db: D1Database,
  pgDb: PostgresDb,
  table: string,
  operation: "insert" | "update" | "delete",
  data: any,
  primaryDb: "d1" | "postgres" = "d1"
) {
  // Write to primary first
  const primary = primaryDb === "d1" ? d1Db : pgDb;
  const secondary = primaryDb === "d1" ? pgDb : d1Db;

  const result = await writeToDb(primary, table, operation, data);

  // Write to secondary (fire and forget, log failures)
  try {
    await writeToDb(secondary, table, operation, data);
  } catch (err) {
    console.error(`Dual-write secondary failed: ${table}/${operation}`, err);
    // Queue for retry or manual reconciliation
  }

  return result;
}
```

#### Verification: Database Migration

| Check | Command/Query | Expected |
|---|---|---|
| Row count match | `SELECT COUNT(*) FROM <table>` on both DBs | Identical counts |
| Sample data match | `SELECT * FROM <table> WHERE id = <known-id>` on both | Identical (after type transform) |
| Foreign key integrity | `SELECT COUNT(*) FROM child WHERE parent_id NOT IN (SELECT id FROM parent)` | 0 orphans |
| Index presence | `SELECT indexname FROM pg_indexes WHERE tablename = '<table>'` | All expected indexes exist |
| Constraint check | `\d <table>` in psql | NOT NULL, UNIQUE, FK constraints match spec |
| Date format | Spot-check 5 date columns | Valid ISO 8601, timezone-aware |
| Boolean conversion | `SELECT DISTINCT is_active FROM users` | `true`/`false` not `0`/`1` |

---

### Schema Overhaul (Same Engine)

When restructuring tables without changing the database engine.

#### Safe Operations (No Downtime)

```sql
-- Adding a nullable column
ALTER TABLE items ADD COLUMN category TEXT;

-- Adding a column with default
ALTER TABLE items ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;

-- Adding an index (use CONCURRENTLY in Postgres)
CREATE INDEX CONCURRENTLY idx_items_category ON items(category);

-- Adding a new table
CREATE TABLE tags (...);
```

#### Unsafe Operations (Require Migration Strategy)

| Operation | Strategy | Steps |
|---|---|---|
| Rename column | Add new → dual-write → backfill → swap reads → drop old | 4 deploys |
| Change column type | Add new column → backfill with cast → swap → drop old | 4 deploys |
| Drop column | Stop reading → deploy → drop in next deploy | 2 deploys |
| Split table | Create new table → dual-write → backfill → swap reads → stop old writes | 5 deploys |
| Merge tables | Create merged table → dual-write → backfill → swap → drop old | 5 deploys |

#### Column Rename Pattern (Detailed)

```
Deploy 1: Add new column, start dual-write
  ALTER TABLE items ADD COLUMN display_name TEXT;
  UPDATE items SET display_name = name;  -- backfill
  -- App code writes to BOTH name and display_name

Deploy 2: Switch reads to new column
  -- App code reads from display_name, still writes both

Deploy 3: Stop writing to old column
  -- App code only reads/writes display_name

Deploy 4: Drop old column
  ALTER TABLE items DROP COLUMN name;
```

---

## Framework Upgrade Playbook

### General Approach

1. **Read the changelog.** Web search `[framework] [version] migration guide`. The
   maintainers document breaking changes — read before doing anything.
2. **Pin the current version.** Before upgrading, ensure `package-lock.json` or
   equivalent locks the current version exactly.
3. **Upgrade in a branch.** Never upgrade on main.
4. **Let the compiler guide you.** After bumping the version, `tsc --noEmit` and
   `eslint .` will find most breaking changes. Fix them systematically.
5. **Run tests before and after.** If tests pass before and after, the upgrade is
   likely safe. If tests don't exist, this is a good time to add them.

### Hono Version Upgrades

```bash
# Check current version
npm ls hono

# Check latest version
npm view hono version

# Read migration guide
# Web search: "hono v[X] migration guide"

# Upgrade
npm install hono@latest

# Fix breaking changes (compiler-guided)
npx tsc --noEmit 2>&1 | head -50

# Run tests
npm test
```

Common Hono breaking changes to watch for:
- Middleware API changes (parameter order, return types)
- Context method renames
- OpenAPI plugin API changes
- Type parameter changes on `Hono<>` generic

### React Major Version Upgrades

```bash
# React has a codemod for major upgrades
npx @react-codemod/cli <transform-name> --help

# Common transforms:
# 18 → 19: automatic ref forwarding, useContext changes
# Check: https://react.dev/blog for release notes
```

### Dependency-Specific Patterns

| Upgrade | Key Breaking Change | Fix Pattern |
|---|---|---|
| Drizzle 0.x → 1.x | Schema builder API changes | Rewrite schema file, regenerate migrations |
| Tailwind 3 → 4 | Config format, JIT changes | Run official migration CLI |
| Vite 5 → 6 | Plugin API, config changes | Check vite.config.ts compatibility |
| TypeScript 5.x → 6.x | Stricter type checks | Fix new type errors (usually improvements) |
| Node 20 → 22 | API deprecations, ESM changes | Check for deprecated API usage |

---

## Auth Provider Swap Playbook

### Critical Rule: No Auth Gap

At no point during the migration should there be a window where users cannot
authenticate. The dual-auth approach ensures continuity:

```
Timeline:
  t0: Old auth only (current state)
  t1: Old auth + new auth side by side (feature-flagged)
  t2: New auth primary, old auth fallback
  t3: New auth only (old decommissioned)
```

### WebAuthn → Supabase Auth

Specific to the aidops ecosystem pattern:

1. Set up Supabase project + enable auth providers
2. Create `src/auth/supabase-auth.ts` alongside existing `src/auth/webauthn.ts`
3. Feature flag: `AUTH_PROVIDER=webauthn|supabase|both`
4. In `both` mode: try Supabase auth first, fall back to WebAuthn
5. Migrate user credentials (map WebAuthn credential IDs to Supabase user records)
6. Switch to `supabase` mode
7. Monitor for auth failures
8. Remove WebAuthn code + feature flag

### Session Migration

When swapping auth, existing sessions must transfer:

```typescript
// migration/auth-session-bridge.ts
async function bridgeSession(oldSession: WebAuthnSession): Promise<SupabaseSession> {
  // Look up user by old credential
  const user = await findUserByWebAuthnCredential(oldSession.credentialId);

  // Create or find Supabase user
  const supabaseUser = await supabase.auth.admin.createUser({
    email: user.email,
    email_confirm: true, // Skip verification for migrated users
    user_metadata: { migrated_from: "webauthn", migration_date: new Date().toISOString() },
  });

  // Issue new session
  const { data } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });

  return data.session;
}
```

---

## Platform Move Playbook

### Workers → Vercel

| Concern | Workers | Vercel | Migration Action |
|---|---|---|---|
| Runtime | V8 isolates | Node.js (or Edge) | Check for Workers-specific APIs (`waitUntil`, `ctx`) |
| Database | D1 (binding) | External (connection string) | Remove D1 bindings, add connection pooling |
| KV | KV namespace (binding) | External (Upstash, Vercel KV) | Swap KV client |
| Config | `wrangler.toml` | `vercel.json` + env vars | Rewrite config |
| Env vars | `wrangler secret` | Vercel dashboard | Transfer secrets |
| Routing | `wrangler.toml` routes | File-based or `vercel.json` | Restructure routes |
| Deploy | `wrangler deploy` | `git push` (auto) | Set up Vercel project |
| Static | Pages | Vercel static | Move to `public/` |

### Workers → Fly.io

Similar pattern but target is a container:
- Add `Dockerfile` + `fly.toml`
- Replace bindings with environment-variable-based connections
- Add connection pooling (Workers doesn't need it, containers do)
- Health check endpoint must respond within container startup time

---

## Structural Refactor Playbook

### Monorepo Restructure

When reorganizing the directory structure of a monorepo:

1. **Map current structure** → document every import path
2. **Design target structure** → map every file's new location
3. **Generate move script** → `git mv` commands for every file
4. **Update imports** → find-and-replace all import paths
5. **Update configs** → tsconfig paths, package.json workspaces, CI paths
6. **Run build** → compiler catches missed imports
7. **Run tests** → verify nothing broke

### Module Extraction

When pulling a module out of a monolith into its own package:

1. **Identify the boundary** → which files belong to the module, which are shared
2. **Catalog external imports** → what does the module depend on from the parent?
3. **Create the package** → `packages/[module]/package.json`, `tsconfig.json`
4. **Move files** → `git mv` to preserve history
5. **Create the interface** → export only what consumers need
6. **Update consumers** → import from package instead of relative path
7. **Add to workspace** → update root `package.json` workspaces

---

## Verification Patterns

### Row Count Verification

```bash
# D1
wrangler d1 execute <db-name> --remote --command "SELECT name, (SELECT COUNT(*) FROM users) as users_count, (SELECT COUNT(*) FROM sessions) as sessions_count"

# Postgres
psql $DATABASE_URL -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"
```

### Checksum Verification (Data Integrity)

```sql
-- Generate a checksum for a table's data
-- Works on both SQLite and Postgres
SELECT COUNT(*) as row_count,
       SUM(LENGTH(CAST(id AS TEXT))) as id_checksum,
       MIN(created_at) as earliest,
       MAX(created_at) as latest
FROM users;
```

### API Smoke Test Suite

```bash
#!/bin/bash
# Run against both old and new endpoints, compare responses
OLD_URL="https://old.example.com"
NEW_URL="https://new.example.com"

endpoints=(
  "GET /api/health"
  "GET /api/users"
  "GET /api/items?limit=5"
)

for ep in "${endpoints[@]}"; do
  METHOD=$(echo $ep | cut -d' ' -f1)
  PATH=$(echo $ep | cut -d' ' -f2)

  OLD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X $METHOD "${OLD_URL}${PATH}")
  NEW_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X $METHOD "${NEW_URL}${PATH}")

  if [ "$OLD_STATUS" == "$NEW_STATUS" ]; then
    echo "✅ $ep: $OLD_STATUS == $NEW_STATUS"
  else
    echo "❌ $ep: OLD=$OLD_STATUS NEW=$NEW_STATUS"
  fi
done
```

---

## Structural Refactor Playbook

### Monorepo Restructure

When moving files, extracting packages, or reorganizing directory structure.

#### Pre-Restructure Checklist

- [ ] Full `git status` clean (no uncommitted changes)
- [ ] All tests pass (baseline)
- [ ] Import map generated (`grep -rn "from ['\"]" --include="*.ts" --include="*.tsx"`)
- [ ] CI pipeline paths documented (which `paths:` filters in GitHub Actions)
- [ ] Package.json `workspaces` array documented

#### Step Ordering

1. **Map current → target.** For every file being moved, document old path → new path.
2. **Generate `git mv` script.** Preserve git history — never copy + delete.
3. **Execute moves.** Run the move script.
4. **Update imports.** Automated find-and-replace on all import paths. Use `tsc --noEmit`
   as the verification — the compiler catches every missed import.
5. **Update configs.** tsconfig `paths`, package.json `workspaces`, wrangler.toml route
   paths, CI workflow `paths:` filters, Dockerfile `COPY` commands.
6. **Run full build.** `npm run build` or equivalent — catches config misses.
7. **Run full test suite.** Confirms no behavioral change.
8. **Update documentation.** README paths, CLAUDE.md references, skill references.

#### Module Extraction Pattern

When pulling a module out of a monolith into its own package:

```
Step 1: Catalog the module boundary
  - Which files belong to the module?
  - What does the module import from the parent? (these become the interface)
  - What imports the module? (these become consumers)

Step 2: Create the package
  packages/[module]/
  ├── package.json    (name: @repo/[module])
  ├── tsconfig.json   (extends root config)
  └── src/            (moved files)

Step 3: Move files with git mv
  git mv src/[module]/* packages/[module]/src/

Step 4: Create the public interface
  packages/[module]/src/index.ts  (export only what consumers need)

Step 5: Update consumers
  - import { X } from "../[module]/..." → import { X } from "@repo/[module]"

Step 6: Add to workspace
  Root package.json: "workspaces": ["packages/*", ...]

Step 7: Verify
  npm install → tsc --noEmit → npm test
```

#### Verification: Structural Refactor

| Check | How | Expected |
|---|---|---|
| No broken imports | `tsc --noEmit` | Zero errors |
| All tests pass | `npm test` | Same pass count as baseline |
| Build succeeds | `npm run build` | Clean build |
| CI paths correct | Push to a branch, check CI triggers | Expected workflows trigger |
| Git history preserved | `git log --follow <moved-file>` | History visible across rename |

---

## Dependency Migration Playbook

### Major Version Bumps

Single dependency upgrade with known breaking changes.

#### Step Ordering

1. **Read the changelog.** Web search `[package] v[X] changelog`. Document every
   breaking change that applies to your usage.
2. **Check for codemods.** Many major versions ship migration scripts:
   `npx @[package]/codemod` or equivalent.
3. **Pin current version.** Verify `package-lock.json` locks the current version.
4. **Create upgrade branch.** `git checkout -b chore/upgrade-[package]-v[X]`
5. **Bump the version.** `npm install [package]@[version]`
6. **Run codemod** if available. Review changes it makes.
7. **Fix remaining breaks.** `tsc --noEmit` + `eslint .` guide you to the rest.
8. **Run test suite.** Fix any test failures.
9. **Manual smoke test.** Click through critical flows.
10. **Merge.**

#### Library Swap (Replace One Dependency with Another)

When replacing a library entirely (Axios → native fetch, Moment → date-fns, Lodash → native):

```
Step 1: Inventory usage
  grep -rn "from ['\"]axios" --include="*.ts" --include="*.tsx" | wc -l
  # Know the scope before starting

Step 2: Write the adapter (if needed)
  # If the swap affects many files, write a thin wrapper that matches
  # the old API but uses the new implementation. Swap the wrapper internals
  # without changing 50 call sites.

Step 3: Replace call sites
  # If no adapter: find-and-replace, file by file
  # Each file: replace import, update usage, verify types

Step 4: Remove old dependency
  npm uninstall [old-package]

Step 5: Verify
  tsc --noEmit → npm test → npm run build
  Check bundle size: should decrease (that's usually the point)
```

#### Verification: Dependency Migration

| Check | How | Expected |
|---|---|---|
| Types compile | `tsc --noEmit` | Zero errors |
| Tests pass | `npm test` | Same pass count |
| Bundle size | `npm run build` + check output | Same or smaller |
| No old dependency | `grep -r "old-package" package*.json` | Not found |
| No old imports | `grep -rn "from.*old-package" --include="*.ts"` | Not found |

---

## Ecosystem Migration Playbook (Opchain Skills)

When the opchain skill ecosystem itself needs upgrading — a new SKILL.md frontmatter
field, a checkpoint protocol version bump, an orchestrator.md rewrite, or a bulk
change to how skills are structured.

### Why This Is a Migration

The skill ecosystem is infrastructure. It has N files (currently 30+ SKILL.md files,
10+ orchestrator.md copies, 10+ checkpoint-protocol.md copies, plus shared
checkpoint CLI/docs) that all follow the same contract. Changing that contract is
a migration — the same expand-migrate-contract discipline applies.

### Common Ecosystem Migrations

| Migration | Scope | Risk | Pattern |
|---|---|---|---|
| Add YAML frontmatter field | All SKILL.md files | LOW | Script + verify |
| Change checkpoint schema (v1 → v2) | All checkpoint reads/writes | MEDIUM | Version negotiation + gradual adoption |
| Rewrite orchestrator.md | All bundled copies | LOW | Generate + diff + replace |
| New shared reference file | All skills that need it | LOW | Add to relevant skills only |
| Rename/merge skills | SKILL.md + triggers + memory edits | MEDIUM | Redirect old triggers → new skill |
| Change skill directory convention | All skill directories | LOW | Script + verify |

### Step Template: Bulk SKILL.md Update

```markdown
## Step 1: Inventory

Scan all skill directories:
  /mnt/skills/user/*/SKILL.md
  /mnt/skills/examples/*/SKILL.md

Count: [N] SKILL.md files to update
Affected: [list which ones need the change vs. which are already compliant]

## Step 2: Define the Change

Current format:
  [show the field/section as it exists today]

Target format:
  [show what it should look like after migration]

Transformation rule:
  [how to convert from current → target, covering edge cases]

## Step 3: Generate Updates

For each affected SKILL.md:
  1. Read current content
  2. Apply transformation
  3. Write to a staging location (/home/claude/skill-migration-staging/)
  4. Diff against original

## Step 4: Review Diffs

Present diffs for the 3 most complex cases.
User approves the transformation pattern.

## Step 5: Apply

Copy updated files to output directory for user to install.
(Skills are read-only in /mnt/skills — user installs via Settings.)

## Step 6: Verify

For each updated skill:
  - [ ] YAML frontmatter parses cleanly
  - [ ] Description field present and non-empty
  - [ ] Commands section intact
  - [ ] No content lost (line count within ±10% of original)
```

### Step Template: Checkpoint Protocol Version Bump

Checkpoint protocol changes are the riskiest ecosystem migration because every skill
reads and writes checkpoints. A format mismatch means lost session state.

```markdown
## Step 1: Design v[N+1] Schema

Document every change from v[N]:
  - Fields added: [list]
  - Fields renamed: [list with old → new mapping]
  - Fields removed: [list]
  - Structural changes: [describe]

## Step 2: Version Negotiation

Add `protocol_version` check to checkpoint reads:
  - v[N+1] reader can read v[N] checkpoints (backward compat)
  - v[N] reader encountering v[N+1] checkpoint: warn, don't crash
  - Migration path: read v[N], write v[N+1] on next checkpoint write

## Step 3: Update checkpoint.mjs

The shared CLI handles read/write. Update `scripts/checkpoint.mjs` to:
  - Write v[N+1] format on new writes
  - Read both v[N] and v[N+1] formats
  - `status` command shows protocol version

## Step 4: Update Each Skill's Checkpoint Writes

For each skill that writes checkpoints:
  - Update the JSON structure to v[N+1]
  - Ensure resume logic handles both versions
  - Test: create a v[N] checkpoint, invoke skill, confirm it reads + upgrades

## Step 5: Update Bundled References

Replace references/checkpoint-protocol.md in every skill directory
with the v[N+1] version.

## Step 6: Verify

For each skill:
  - [ ] Can read existing v[N] checkpoint
  - [ ] Writes v[N+1] format
  - [ ] Resume protocol works with both versions
  - [ ] Cross-skill reads still work (e.g., oc-deploy-ops reads oc-code-auditor)
```

### Step Template: Orchestrator.md Rewrite

The oc-orchestrator protocol file is bundled in every dev skill. When it changes,
all copies must sync.

```markdown
## Step 1: Write New Version

Draft the updated orchestrator.md.
Key changes: [describe what's different]

## Step 2: Diff Against Current

Show diff between current and new version.
Identify which sections changed, which are untouched.

## Step 3: Impact Assessment

Which skills are affected by the changes?
  - Pipeline map changes → all skills that reference the map
  - Routing table changes → all skills with welcome protocol
  - Chaining changes → specific skills in the chain

## Step 4: Bulk Replace

For each skill directory containing references/orchestrator.md:
  Copy the new version in.

## Step 5: Verify

  - [ ] Every copy is identical (checksum match)
  - [ ] Pipeline map is accurate (matches actual skill set)
  - [ ] Routing table includes all current skills
  - [ ] No skill-specific customizations were overwritten
```

### Step Template: Skill Rename / Merge

When renaming a skill (e.g., `tri-dev` → `oc-app-architect` Phase 6) or merging two skills
into one. This is the most complex ecosystem migration because it touches skill files,
trigger descriptions, checkpoint references, oc-orchestrator routing tables, AND the user's
Claude memory edits.

```markdown
## Step 1: Define the Change

Old skill: [name] (commands: [list])
New skill: [name] (commands: [list])
Merge behavior: [old commands redirect to new | old commands removed | old commands kept as aliases]

## Step 2: Update the Target Skill

Incorporate the old skill's functionality into the new skill's SKILL.md.
Ensure the new skill's description includes trigger phrases that would have
matched the old skill.

## Step 3: Update Orchestrator Routing

In orchestrator.md (and the oc-orchestrator skill):
  - Remove old skill from pipeline map
  - Add redirect: "If user asks for [old-skill], route to [new-skill]"
  - Update upstream/downstream table

## Step 4: Update Cross-Skill References

Search all SKILL.md files for references to the old skill name:
  grep -rn "[old-skill]" /mnt/skills/user/*/SKILL.md
  grep -rn "[old-skill]" /mnt/skills/user/*/references/*.md

Update each reference to point to the new skill.

## Step 5: Handle Existing Checkpoints

If projects have checkpoints from the old skill:
  .checkpoints/[old-skill].checkpoint.json
The new skill should detect and read these on resume, offering to migrate.

## Step 6: Update Memory Edits

Use memory_user_edits to update any routing instructions or skill references
stored in Claude's memory:
  1. memory_user_edits command="view" — check for references to old skill name
  2. memory_user_edits command="replace" — update to new skill name

This is critical — if memory says "use tri-dev for builds" but tri-dev is
merged into oc-app-architect, Claude will try to invoke a skill that no longer exists.

## Step 7: Remove Old Skill

Delete the old skill directory from the skill installation.
User action: Settings → Customize → Skills → delete old skill.

## Step 8: Verify

  - [ ] New skill triggers on all old skill's trigger phrases
  - [ ] Old skill's commands work via new skill (or redirect message shown)
  - [ ] Orchestrator routing table updated
  - [ ] No remaining references to old skill name in any SKILL.md
  - [ ] Memory edits updated
  - [ ] Existing checkpoints readable by new skill
```

### Ecosystem Migration Verification

| Check | How | Expected |
|---|---|---|
| All SKILL.md files parse | Extract YAML frontmatter from each | No parse errors |
| All descriptions present | Grep for `description:` in frontmatter | N/N skills have descriptions |
| Shared checkpoint CLI valid | `node scripts/checkpoint.mjs validate` | All checkpoints pass schema validation |
| All orchestrator.md identical | `md5sum */references/orchestrator.md` | All checksums match (or document intentional diffs) |
| Trigger coverage | List all commands across all skills | No collisions, no gaps |

### Output: Ecosystem Migration Package

Ecosystem migrations produce a zip of updated skill files for the user to install,
plus a changelog:

```markdown
## Ecosystem Migration: [description]

### Changed Skills
| Skill | Files Changed | Change Summary |
|---|---|---|
| oc-app-architect | SKILL.md, references/orchestrator.md | Added new frontmatter field, updated pipeline map |
| oc-code-auditor | references/orchestrator.md | Updated pipeline map |
| ... | ... | ... |

### Unchanged Skills
[List skills not affected by this migration]

### Installation
1. Download the attached .skill.zip files
2. Go to Settings → Customize → Skills
3. Delete the old version of each changed skill
4. Upload the new version

### Rollback
Keep the old .skill.zip files. To revert, delete the new versions and
re-upload the old ones.
```

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Do Instead |
|---|---|---|
| Big-bang cutover | One failure = full rollback of everything | Incremental steps with individual rollback |
| "It works on my machine" | Local D1 ≠ remote D1 ≠ Postgres | Verify on staging before production |
| Skipping the backup | "The migration is simple" → data loss | Always backup first, verify the backup is restorable |
| Upgrading 3 major versions at once | Compounding breaking changes | Upgrade one major version at a time |
| Migrating data without checksums | "It looks right" → silent data loss | Row counts + checksums at every batch |
| Changing auth + database simultaneously | Two HIGH-risk migrations at once | Sequential: database first, then auth |
| No rollback plan | "We'll figure it out if it fails" | Document rollback before executing |
| Migrating during peak traffic | Increased load during transition | Schedule for low-traffic window |
| Updating half the skills and forgetting the rest | Ecosystem drift, inconsistent behavior | Inventory all affected files, verify all updated |
