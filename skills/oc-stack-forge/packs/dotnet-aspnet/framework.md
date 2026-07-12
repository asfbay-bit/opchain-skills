# ASP.NET Core

ASP.NET Core is the dominant C# web framework — and the only framework anyone seriously
greenfields on the .NET stack today. It pairs Microsoft's high-performance Kestrel
server with a clean middleware pipeline, dependency injection out of the box, and two
flavours for HTTP surfaces (Minimal APIs for small services, MVC controllers for larger
ones). Stack-forge picks ASP.NET Core automatically when the language pack is `csharp`
and the surface is web-facing.

## When to pick it

- Any web-facing C# service: REST APIs, gRPC services, SignalR-based real-time apps,
  server-rendered web apps (Razor Pages or MVC), Blazor full-stack apps.
- High-throughput backends — ASP.NET Core consistently lands in the top tier of
  TechEmpower benchmarks, comparable to Go or Rust frameworks.
- Workloads on Azure that benefit from first-party tooling: Application Insights,
  Managed Identity, Azure SDK integrations work seamlessly.
- gRPC services — first-class support via `Grpc.AspNetCore`; protobuf codegen
  integrated into the build.

Skip when: cold start matters and you can't use AOT (Lambda-style serverless without
native AOT — though .NET 8's AOT gets cold start to ~200ms, so this exemption is
shrinking); the surface is a CLI or pure library (use plain `dotnet new console`);
the team is greenfield with no .NET history and the workload is small (TypeScript
ramps faster).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `dotnet test` | xUnit + `Microsoft.AspNetCore.Mvc.Testing` for integration tests. `WebApplicationFactory<T>` spins up an in-process server for E2E tests. |
| Build | `dotnet build` | Restores + compiles. CI runs `dotnet build -c Release` then `dotnet publish -c Release` for deployable output. |
| Lint | `dotnet format --verify-no-changes` | Same as csharp base. ASP.NET Core's analyzers add controller- and middleware-specific rules. |
| Asset pipeline | None built-in for APIs | Static files served via `app.UseStaticFiles()`. For Blazor / MVC views, build assets with a JS bundler externally. |
| Generator | `dotnet new webapi`, `dotnet new mvc`, `dotnet new blazor` | Idiomatic project templates; oc-stack-forge defers to these for greenfield. |

## When oc-stack-forge picks ASP.NET Core

The language → framework decision is short:

```
language = csharp
purpose ∈ {web-api, web-app, grpc-service, real-time, internal-tool}
→ ASP.NET Core
```

When the workload is "library", "CLI tool", or "WPF/WinForms desktop", oc-stack-forge
picks plain `dotnet new console` or the appropriate desktop template — not ASP.NET
Core.

## Minimal APIs vs. MVC controllers

ASP.NET Core ships two HTTP surface styles. Stack-forge defaults based on workload
shape:

| Use Minimal APIs | Use MVC Controllers |
|---|---|
| Small service / microservice (< 20 routes) | Larger app with cross-cutting filters |
| Functional route style (`app.MapGet("/users", ...)`) | Class-based handlers with attributes |
| Pairing with native AOT / Lambda | Razor Pages, MVC views, hybrid surfaces |
| API-only surface | Full MVC features (model binding, action filters) |

Both compose cleanly with OpenAPI via Swashbuckle. The decision is style + scale, not
capability.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Azure App Service | The opchain default for ASP.NET Core | First-party deploy story; managed identity, Application Insights, deployment slots. |
| Azure Container Apps | Containerised services | Scale-to-zero; pair with Dapr for distributed primitives if needed. |
| AWS ECS / Fargate | ASP.NET Core on AWS | Container `dotnet publish` output; pair with ALB + CloudWatch. |
| AWS Lambda | Serverless ASP.NET Core | .NET 8 native AOT + `Amazon.Lambda.AspNetCoreServer` gets cold start under 200ms. |
| Kubernetes (AKS / EKS) | Multi-service deployments | AKS for Microsoft-shop, EKS otherwise. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the hardcoded
matrix in `SKILL.md`.

## Gotchas oc-stack-forge will flag

- **EF Core change-tracking on read-only queries** — bulk reads without `AsNoTracking()`
  hold all entities in memory + change tracker. Stack-forge audits flag handler methods
  that load > 100 entities without `AsNoTracking()`.
- **Sync-over-async in handlers** — `.Result` or `.Wait()` on a Task in a handler can
  deadlock the thread pool under load. Stack-forge flags any sync-over-async pattern
  in `Controller` or Minimal API delegates.
- **Middleware order matters** — `UseAuthentication()` must come before `UseAuthorization()`;
  CORS before routing; static files often before routing. Stack-forge's audit pass
  flags common misorderings in the pipeline configuration.
- **Configuration secret leakage** — `appsettings.Development.json` sometimes ships in
  production images because `dotnet publish` includes all `appsettings.*.json` by default.
  Stack-forge audits the publish output for environment-specific config files.
- **Native AOT trim warnings ignored** — Building with `<PublishAot>true</PublishAot>`
  surfaces trim warnings for reflection-using code; ignoring them produces apps that
  crash at runtime. Stack-forge enforces `-warnaserror` for AOT builds.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.dotnet-aspnet.enabled` defaults to `true`). .NET 8 LTS is the
canonical target; .NET 9 supported. .NET Framework 4.x ASP.NET (non-Core) is out of
scope.
