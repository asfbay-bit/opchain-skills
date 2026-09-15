# Spring Boot (Kotlin)

Spring Boot with Kotlin is the same framework as Spring Boot for Java — but written
in a language built for concise, expressive backend code. Spring has had first-class
Kotlin support since Spring 5: nullable types flow through the framework, coroutines
integrate with the reactive stack, and the official `start.spring.io` initializr offers
Kotlin as a peer to Java. Stack-forge picks spring-kotlin when the language pack is
`kotlin` and the surface is web-facing.

## When to pick it

- Any web-facing Kotlin service: REST APIs, GraphQL services, server-rendered UIs,
  enterprise integrations on the JVM.
- Transactional backends where the team wants Spring's ecosystem (Spring Data, Spring
  Security, Spring Cloud) with Kotlin's ergonomics — data classes for DTOs, null
  safety on entities, extension functions for fluent test setup.
- Coroutine-heavy workloads — Spring's `WebFlux` plus Kotlin coroutines makes reactive
  programming feel imperative. Worth using on backpressure-aware services (fan-out
  pipelines, gRPC streaming) where reactive truly fits.
- Teams running JVM in production who want a less verbose option for new services.
  Same operational story as Java + Spring; cheaper to write and read.

Skip when: cold start matters (Spring Boot's 3-8s startup hurts Lambda; pick a
GraalVM-native framework instead); the workload is pure Android client (use the
`kotlin-android` mobile pack from PR 6.5); the team has no JVM history at all (the
Spring learning curve is the bottleneck, not the language).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `gradle test` | JUnit 5 is the default; Kotest is the idiomatic Kotlin alternative with property-based testing and a richer DSL. `@SpringBootTest` works identically to Java. |
| Build | `gradle build` | Produces an executable fat-jar (Spring Boot Gradle plugin). Use `./gradlew bootRun` for local dev. Maven is supported but most Kotlin-first repos use Gradle. |
| Lint | `ktlint` | Same as Kotlin base. Spring Boot Kotlin scaffolds have a clean ktlint profile. `detekt` adds heavier static analysis. |
| Asset pipeline | None built-in | Spring Boot serves static assets from `src/main/resources/static/`. Pair with a JS bundler when the project includes frontend code. |
| Generator | `start.spring.io` with Kotlin selected | Idiomatic Kotlin Spring Boot project bootstrap; oc-stack-forge defers to this for greenfield. |

## When oc-stack-forge picks Spring Boot (Kotlin)

The language → framework decision is short:

```
language = kotlin
purpose ∈ {web-api, web-app, internal-tool, enterprise-integration}
→ Spring Boot (Kotlin)
```

When the workload is "library", "CLI tool", or "Android client", oc-stack-forge picks
plain Kotlin (or the kotlin-android mobile pack) instead of Spring.

## Kotlin-idiomatic Spring patterns

Stack-forge scaffolds favour Kotlin-native patterns over copy-paste from Java tutorials:

```kotlin
@RestController
class UserController(private val service: UserService) {       // ← constructor injection
    @GetMapping("/users/{id}")
    fun get(@PathVariable id: Long): UserDto =                 // ← expression-body fn
        service.find(id) ?: throw NotFoundException()          // ← null safety
}

@Service
class UserService(private val repo: UserRepository) {
    fun find(id: Long): UserDto? =
        repo.findByIdOrNull(id)?.toDto()                       // ← Kotlin stdlib helpers
}
```

Notes oc-stack-forge will enforce:

- Constructor injection over field injection (no `@Autowired` on `var` fields).
- Data classes for DTOs; plain classes with explicit constructors for JPA entities
  (data-class + Hibernate proxies have sharp edges).
- Coroutine handlers via `suspend fun` when using Spring WebFlux + Kotlin coroutines;
  blocking handlers via plain `fun` when using Spring MVC.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| AWS ECS / Fargate | The opchain default for Spring Boot (Kotlin) | Container the fat-jar; ALB in front. Same deployment shape as Java + Spring. |
| Kubernetes (EKS / GKE) | Multi-service deployments | Spring Cloud Kubernetes for config + service discovery. |
| Google Cloud Run | Containerised stateless services | Scale-to-zero; Kotlin's faster cold start vs. Java helps here, but Spring's 3-8s boot still hurts. |
| Heroku | Small Spring Boot Kotlin apps | Easy onboarding; the official JVM buildpack works fine. |
| Render | Heroku-style alternative | Same shape as Heroku, often cheaper. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the hardcoded
matrix in `SKILL.md`.

## Gotchas oc-stack-forge will flag

- **`open` modifier for JPA entities** — Kotlin classes are `final` by default; JPA
  needs them open for proxy generation. Stack-forge bakes the `kotlin-allopen` Gradle
  plugin (with `spring` + `jpa` presets) into scaffolds to avoid the manual `open`
  sprinkle.
- **N+1 JPA queries** — same as Java + Spring. `@OneToMany` defaults to LAZY; iteration
  fires per-row queries. Stack-forge audits flag iteration over entity collections
  without explicit fetch strategy.
- **`!!` not-null assertions in handlers** — defeats Kotlin's null safety story.
  Stack-forge audits flag `!!` in controller / service code; the right move is
  modelling nullability through the type system or throwing a domain-meaningful
  exception.
- **Coroutine scope leakage** — `GlobalScope.launch` in a handler bypasses Spring's
  request lifecycle. Stack-forge audits flag top-level `GlobalScope` usage; use
  `coroutineScope` or `withContext(Dispatchers.IO)` instead.
- **Cold start on serverless** — Spring Boot startup is slow whether the language is
  Java or Kotlin. Stack-forge advises GraalVM native image via Spring Native when
  the deploy target is Lambda.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.spring-kotlin.enabled` defaults to `true`). Spring Boot 3.x +
Kotlin 1.9+ is the canonical target; JVM 17 LTS / 21 LTS supported. Server-side
workloads only — Android lives under the `kotlin-android` mobile pack in PR 6.5.
