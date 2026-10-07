# Go

The single-binary, low-latency, high-throughput choice. Stack-forge picks Go
when the workload is performance-sensitive, the team values explicit error
handling, and single-binary deploy aesthetics matter. Compile times stay
sub-second; the standard library carries more weight than in any other
language in the catalog.

## When to pick it

- Latency-sensitive APIs (sub-50ms p99 target) where GC pauses still beat
  Node's event-loop stalls.
- Long-running connections (WebSockets, gRPC streaming) — Go's goroutines
  scale to tens of thousands per process.
- Infra tooling, CLIs, daemons — `go build` produces a single static binary,
  trivially containerised or shipped as a release asset.
- High-throughput workers — pair with a queue (NATS, Kafka, SQS) and saturate
  cores without `multiprocessing` gymnastics.

Skip when: the team has no Go experience AND the app is CRUD-heavy
(Django/Rails will ship faster), or when the workload is data/ML-shaped
(Python wins on library coverage), or when you genuinely need full-stack
shared types in-process (TypeScript).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `go test ./...` | Standard library; `gotestsum` for prettier output in CI. |
| Build | `go build ./...` | Single binary, statically linked by default (set `CGO_ENABLED=0` to enforce). |
| Lint | `golangci-lint run` | Meta-linter; bundles staticcheck, gosec, govet, ineffassign, etc. |
| Format | `gofmt -w .`, `goimports -w .` | Non-negotiable. CI fails on unformatted code in idiomatic projects. |
| Type checker | Built into `go vet`; `staticcheck` for deeper analysis. | Go's type system is strict by default; no separate checker needed. |
| Package manager | `go mod` | One canonical answer; module-aware since 1.11. |

## Frameworks (land in later v1.4 PRs)

These are the go-language frameworks oc-stack-forge will recommend once their
packs ship in PRs 4-7:

- **chi** (preferred) — idiomatic `net/http` router; minimal magic.
- **Echo** — slightly more batteries; middleware-heavy projects.
- **Fiber** — Express-shaped API on top of fasthttp; non-standard but
  familiar to Node refugees.
- **stdlib `net/http`** — for projects that want zero framework dependency.
  Stack-forge picks this when the API surface is small (< 10 endpoints).

PR 2 ships the language pack only. Framework packs (and the bidirectional
`frameworks: [chi, echo, fiber]` entry on this pack) arrive in PRs 4-7.

## Typed pipeline

`DB schema → sqlc generated types → handlers → swaggo/gin-swagger OpenAPI →
openapi-typescript client`.

| Stage | Default | Alternative | Notes |
|---|---|---|---|
| ORM / schema | `sqlc` (preferred) | GORM, sqlx | `sqlc` generates Go types from SQL queries — closest thing Go has to a typed pipeline source-of-truth. GORM is closer to ActiveRecord but pays a reflection cost. |
| Migrations | `goose`, `golang-migrate` | Atlas | Pick goose for simplicity, Atlas for declarative schema diffing. |
| API contract | swaggo annotations → OpenAPI | huma framework, ogen | swaggo is the most common but annotation-heavy. ogen generates handler interfaces from OpenAPI (spec-first). |
| Validation | `go-playground/validator` | manual | Tag-driven validation on request structs. |
| Client | `openapi-typescript` | grpc-web | OpenAPI for REST clients; gRPC-web when the API is gRPC. |

When oc-app-architect Phase 2 detects a first-party API surface and oc-stack-forge
has picked Go, control passes to `oc-api-dev` to author the contract (often
spec-first via ogen) and generate the SDK.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Fly.io | Most Go services | Regional VMs without configuring a CDN; ships single binaries efficiently; pairs cleanly with Fly Postgres. |
| Cloud Run | Stateless containers needing GCP integration | Scales to zero; pairs with Cloud SQL or Cloud Spanner. |
| AWS Lambda | Burst-y workloads in existing AWS | Go's cold start is acceptable; pair with API Gateway. |
| Containers on ECS / EKS / GKE | Enterprise | Higher floor; standard k8s patterns apply. |
| Self-hosted Linux VPS | Simplest possible | Static binary + systemd unit + nginx in front — works fine for a long time. |

Deploy-target packs land alongside framework packs in PRs 4-7.

## Cost band (2026-Q2, rough)

| Tier | Fly.io | Cloud Run |
|---|---|---|
| Hobby | $0 (3 shared-cpu-1x) | $0 (free tier covers small workloads) |
| Small team (10K MAU) | $20 (1 dedicated VM + Postgres cluster) | $25 – $50 (depends on request volume) |

Go's single-binary deploys and low memory footprint make it the cheapest
language in the catalog to run at any non-trivial scale. The headline cost
is dev-team learning curve, not infrastructure.

## Gotchas oc-stack-forge will flag

- **Goroutine leaks** — fire-and-forget `go func()` calls without a
  `context.Context` will pile up. Stack-forge flags handler patterns that
  spawn goroutines without an exit path.
- **Error handling discipline** — Go's `if err != nil { return ... }`
  pattern is verbose but explicit. Stack-forge nudges against wrapping
  errors with bare `fmt.Errorf` (use `%w` so callers can `errors.Is/As`).
- **Database connection pooling** — `database/sql` defaults to an unbounded
  pool. Stack-forge bakes `SetMaxOpenConns` / `SetMaxIdleConns` into its
  scaffolds; cloud Postgres providers will refuse connections otherwise.
- **No generics convergence yet** — Go 1.18+ has generics, but the
  ecosystem is still mid-migration. Stack-forge recommends generics for
  new code but doesn't insist on retrofitting older libraries.

## Status

`stable` — full coverage. Default visible (`skills.coverage.go.enabled`
defaults to `true`). No deprecation path planned.
