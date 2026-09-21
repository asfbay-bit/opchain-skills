# Kotlin

Stack-forge's pick when the workload wants the **JVM ecosystem and tooling depth of
Java, but with modern language ergonomics** — null safety, data classes, coroutines,
extension functions, and a syntax that doesn't require ceremony for every plain object.
Kotlin shines on long-running backend services where the team wants the Spring +
Hibernate + Maven Central library catalog without writing Java. It's also Google's
first-class Android language, but server-side workloads are the focus of this pack —
Android lives under the dedicated mobile pack in PR 6.5.

## When to pick it

- Transactional backends where you'd otherwise pick Java but the team prefers
  Kotlin's ergonomics. Spring Boot has first-class Kotlin support; idiomatic
  Kotlin + Spring is more concise than Java + Spring without losing the ecosystem.
- Coroutine-heavy workloads — gRPC servers, fan-out pipelines, reactive data flows.
  Kotlin coroutines + structured concurrency map cleanly to backpressure-aware service
  designs.
- Teams already running JVM services who want a less verbose option for new services
  without leaving the platform.
- Multi-platform code sharing (Kotlin Multiplatform) — share a domain model between
  the JVM backend and the Android client. Niche but real value where it fits.

Skip when: the workload is edge-runtime (no JVM); the team is greenfield with no
JVM history and cold-start sensitive (Go or TypeScript ramp faster); the surface is
primarily Android client code (use the mobile kotlin-android pack from PR 6.5 instead).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `gradle test` | JUnit 5 is the default; Kotest is the idiomatic Kotlin alternative. CI uses `gradle check` to bundle test + lint. |
| Build | `gradle build` | Produces a deployable JAR. Use `./gradlew` (Gradle wrapper) in repos for reproducibility. Maven is also supported (`mvn package`) for teams migrating from Java. |
| Lint | `ktlint` | The de-facto Kotlin linter — opinionated, low-config. `detekt` is the heavier alternative for richer static analysis. |
| Format | `ktlint --format` | In-place formatting. Pre-commit hook in most teams. |
| Package manager | Gradle (default) or Maven | Lockfile is `gradle.lockfile` or `settings.gradle.kts` resolution. Stack-forge defers to the build tool present in the repo. |

## Frameworks

These are the kotlin-language frameworks oc-stack-forge recommends:

- **Spring Boot (Kotlin)** — the dominant web framework. Stack-forge picks it for any
  web-facing Kotlin service. First-class Kotlin support since Spring 5; pairs cleanly
  with Spring Data JPA and Spring Security.

Other niches oc-stack-forge will mention in advisories but does not pack:

- **Ktor** — JetBrains-built async web framework; coroutine-native. Excellent fit
  for streaming / WebSocket-heavy workloads. May get a dedicated pack in v1.5.
- **http4k** — functional HTTP toolkit; minimalist alternative for teams that prefer
  composable functions over annotations.
- **Micronaut Kotlin** — compile-time DI, GraalVM-friendly. Niche.

## Typed pipeline

Kotlin is statically typed with strong null-safety guarantees:

| Stage | Tool | Why |
|---|---|---|
| ORM / schema | Spring Data JPA + Hibernate (default), Exposed for SQL-first | JPA is the Spring default; Exposed when the team wants idiomatic Kotlin DSL over SQL. |
| API contract | springdoc-openapi | Generates OpenAPI from `@RestController` annotations; works identically to Java + Spring. |
| Client | `openapi-generator` (kotlin generator) | Typed Kotlin clients from springdoc-emitted spec. |
| Validation | Bean Validation (`jakarta.validation`) | Annotations on data classes (`@NotNull`, `@Size`, `@Valid`). Kotlin's nullable types add a compile-time layer above runtime validation. |

When oc-app-architect Phase 2 detects a first-party API surface and oc-stack-forge picks
Kotlin + Spring, control passes to `oc-api-dev` to materialise the OpenAPI chain.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| AWS ECS / Fargate | Enterprise Kotlin services | The canonical home; same deployment shape as Java + Spring. The opchain default for Kotlin server-side. |
| Kubernetes (EKS / GKE) | Multi-service deployments | When the org already runs k8s. Spring Cloud Kubernetes for config + discovery. |
| Heroku | Small Spring Boot services | Easiest path for sub-50-MAU prototypes. |
| Render | Heroku-style alternative | Same shape as Heroku, often cheaper. |
| Google Cloud Run | Containerised stateless services | Good fit for scale-to-zero workloads; pairs with Kotlin's faster startup vs. Java. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the hardcoded
matrix in `SKILL.md`.

## Cost band (2026-Q2, rough)

| Tier | ECS Fargate | Cloud Run | Heroku |
|---|---|---|---|
| Hobby | $15–25 | $0 (consumption tier, free quota) | $7 (eco dyno) |
| Small team (10K MAU) | $80–150 + RDS | $30–80 + Cloud SQL | $50–100 + Postgres |

JVM memory floor still applies; idle Spring Boot wants ~256 MB. Kotlin doesn't change
that — coroutines reduce thread count but the JVM heap floor is constant. Check vendor
pricing at decision time.

## Gotchas oc-stack-forge will flag

- **Coroutine cancellation propagation** — forgetting `coroutineScope` or `supervisorScope`
  in nested launches leaks structured concurrency. Stack-forge audits for top-level
  `GlobalScope.launch` calls in handler code (almost always a bug).
- **JPA + data classes** — Kotlin data classes work with JPA but have sharp edges
  around `equals`/`hashCode` and Hibernate proxies. Stack-forge advises plain classes
  with explicit constructors for entities, data classes for DTOs.
- **Null platform types** — Java interop returns "platform types" (nullable in Java,
  unknown in Kotlin). Stack-forge audits for unchecked `!!` and `?.let` patterns at
  Java boundaries.
- **Gradle build daemon memory** — CI builds with the default Gradle daemon OOM on
  small runners. Stack-forge bakes `org.gradle.jvmargs=-Xmx2g` and parallel build flags
  into its scaffolds.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.kotlin.enabled` defaults to `true`). Kotlin 1.9+ is the canonical
target; JVM 17 LTS / 21 LTS supported. Server-side workloads only — Android lives
under the `kotlin-android` mobile pack in PR 6.5.
