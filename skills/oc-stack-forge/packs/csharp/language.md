# C#

Stack-forge's pick when the workload is **enterprise services on the Microsoft stack**
or **performance-sensitive backends that want modern tooling without Java's verbosity.**
The modern .NET line (5/6/7/8) has reset C# as a serious cross-platform contender —
fast startup, AOT compilation, first-class Linux + container support — while keeping
the deep Microsoft tooling story (Visual Studio, Rider, Azure SDK, EF Core). Stack-forge
nudges toward C# when the team profile signals .NET history, the deploy target is Azure
or already-containerised AWS, or when the workload is "Java-shaped but the team prefers
LINQ + records over POJOs."

## When to pick it

- Enterprise services on Azure — first-party tooling story (Application Insights,
  Azure SDK, Functions) is unmatched outside Azure.
- Transactional backends that want modern language features (records, pattern matching,
  nullable reference types) without the JVM's startup-and-memory floor.
- Workloads that benefit from AOT compilation — gRPC services, sidecars, Lambda
  functions. .NET 8's native AOT gets cold start into edge-runtime territory.
- Game-server or Unity-adjacent backends where C# is already the shared language with
  the client team.

Skip when: the workload is edge-runtime (no .NET there outside Cloudflare's beta);
the team is greenfield with no .NET history (TypeScript or Python ramp faster); the
ecosystem you need lives in JVM-only (Hadoop, Kafka clients, some payment SDKs).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `dotnet test` | xUnit is the default; NUnit and MSTest are also first-class. CI uses `dotnet test --logger trx` for structured output. |
| Build | `dotnet build` | Restores + compiles. CI usually runs `dotnet build -c Release` to bundle a release build. `dotnet publish -c Release` for deployable artifacts. |
| Lint | `dotnet format --verify-no-changes` | Built-in formatter + analyzer enforcement. Fails CI if formatting drifts. |
| Format | `dotnet format` | Applies fixes. Pre-commit hook in most teams. |
| Package manager | NuGet (`dotnet add package`, lockfile via `packages.lock.json`) | Lockfile is opt-in but oc-stack-forge recommends enabling it for reproducibility. |

## Frameworks

These are the csharp-language frameworks oc-stack-forge recommends:

- **ASP.NET Core** — the dominant web framework. Stack-forge picks it for any
  web-facing C# service. Minimal APIs for small services; full MVC for richer
  surfaces. Pairs with EF Core for ORM, SignalR for real-time.

Other niches oc-stack-forge will mention in advisories but does not pack:

- **Blazor (Server / WebAssembly)** — full-stack C# with the frontend in C# too.
  Niche but growing; in v1.5 we may add a dedicated Blazor framework pack.
- **Orleans** — Microsoft's actor framework, for stateful distributed services.
- **Nancy / Carter** — micro-framework alternatives; rarely chosen for new work.

## Typed pipeline

C# is statically typed with deep tooling support:

| Stage | Tool | Why |
|---|---|---|
| ORM / schema | Entity Framework Core (default), Dapper for SQL-first | EF Core is the Microsoft default; Dapper when the team wants control. |
| API contract | Swashbuckle (OpenAPI), or NSwag for richer codegen | Generates OpenAPI from controllers via attributes. |
| Client | NSwag or `openapi-generator` | NSwag for C#-native; openapi-generator for cross-language clients. |
| Validation | FluentValidation or DataAnnotations | DataAnnotations on DTOs (`[Required]`, `[Range]`); FluentValidation for richer rules. |

When oc-app-architect Phase 2 detects a first-party API surface and oc-stack-forge picks
C# + ASP.NET Core, control passes to `oc-api-dev` to materialise the OpenAPI chain via
Swashbuckle + NSwag.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Azure App Service | Greenfield ASP.NET Core | First-party deploy story; managed identity, Application Insights, slots. The opchain default for C#. |
| Azure Container Apps | Containerised services | When the workload needs scale-to-zero or more orchestration than App Service. |
| AWS ECS / Fargate | C# on AWS | Container `dotnet publish` output; pair with ALB + CloudWatch. |
| AWS Lambda | Serverless C# | .NET 8 native AOT gets cold start under 200ms. Pair with API Gateway. |
| Kubernetes (AKS / EKS) | Multi-service deployments | When the org already runs k8s. AKS for Microsoft-shop, EKS otherwise. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the hardcoded
matrix in `SKILL.md`.

## Cost band (2026-Q2, rough)

| Tier | App Service | Container Apps | Fargate |
|---|---|---|---|
| Hobby | $13 (B1 instance) | $0 (consumption tier, free quota) | $15–25 |
| Small team (10K MAU) | $55–100 (P1v3 + Azure SQL) | $30–80 (auto-scale) | $80–150 |

.NET 8 AOT reduces the memory floor significantly — a native AOT minimal API can fit
in 64 MB. That tilts cost favorably when the workload is small but not tiny. Check
vendor pricing at decision time.

## Gotchas oc-stack-forge will flag

- **EF Core change-tracking overhead** — entity-tracking is on by default and gets
  expensive on bulk operations. Stack-forge audits flag `Add` loops without
  `AddRange` + `AsNoTracking()` on read-only queries.
- **Nullable reference types not enforced** — projects pre-dating .NET 6 sometimes
  ship with NRT off, hiding null-safety holes. Stack-forge advises enabling
  `<Nullable>enable</Nullable>` project-wide and fixing the warnings.
- **Configuration leakage in container builds** — `appsettings.Development.json`
  sometimes ships in production images. Stack-forge audits the publish output
  for environment-specific config files.
- **Async-over-sync deadlocks** — `.Result` and `.Wait()` on tasks in ASP.NET Core
  can deadlock the request thread pool. Stack-forge flags any sync-over-async pattern
  in handler code.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.csharp.enabled` defaults to `true`). .NET 8 LTS is the canonical
target; .NET 9 is supported. .NET Framework (4.x) is out of scope — modernise first.
