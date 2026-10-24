# Java

Stack-forge's pick when the workload is **enterprise-grade, long-running, JVM-shaped** —
transactional services with deep object models, multi-team ownership, mature observability,
and a deployment story that already involves the JVM. Java still wins inside large
organisations because the toolchain is battle-tested across decades, profilers and APMs
target it first, and the hiring pool is enormous. Stack-forge nudges toward Java when the
team profile signals enterprise / regulated / "already on the JVM" and the workload is
not edge-first.

## When to pick it

- Transactional backends with rich domain models — banking, insurance, ERP, healthcare —
  where Spring's IoC + JPA + observability story is the path of least resistance.
- Teams already running JVM services in production with established CI/CD, profiling,
  and on-call tooling. Adding another JVM service is cheaper than introducing a new
  runtime.
- Long-running services that benefit from JIT warm-up — high-throughput APIs that stay
  hot. JVM is at its best when the process doesn't restart constantly.
- Workloads with first-class library coverage in the JVM ecosystem (Apache stack,
  payment gateways, enterprise integrations) that have no real Node/Python equivalent.

Skip when: the workload is cold-start sensitive (Lambda-style serverless — JVM warm-up
hurts; pick Go, TypeScript, or Rust); the team is greenfield with no JVM history (the
"build a Spring app" learning curve is real — TypeScript or Python ramp faster); the
surface is edge-runtime (no JVM there at all).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `mvn test` | JUnit 5 is the default. `mvn verify` runs integration tests in the `verify` phase. |
| Build | `mvn package` | Produces a deployable JAR/WAR. CI usually runs `mvn -B verify` to bundle test + package. |
| Lint | `mvn checkstyle:check` | Checkstyle is the canonical lint. Spotbugs / PMD are common secondary scanners. |
| Format | `mvn spotless:apply` | Google Java Format via Spotless plugin. Runs as a pre-commit hook in most teams. |
| Package manager | `mvn` (Maven Central) | Lockfile-equivalent is `pom.xml` + the local `~/.m2/repository` cache. Gradle is the common alternative (`gradle build`); oc-stack-forge defers to whichever is present in the repo. |

## Frameworks

These are the java-language frameworks oc-stack-forge recommends:

- **Spring Boot** — the dominant full-stack framework. Stack-forge picks it for any
  web-facing Java service unless the team explicitly wants something lighter. Pairs
  with Spring Data JPA, Spring Security, Spring Cloud.

Other niches oc-stack-forge will mention in advisories but does not pack:

- **Quarkus** — Kotlin-friendly, GraalVM-native-image-first. Good for serverless Java
  where cold start matters. Not packed in v1.4; revisit in v1.5.
- **Micronaut** — compile-time DI, fast startup. Niche; small but loyal user base.
- **Plain servlet / Jetty** — for libraries or sidecars that don't need a framework.

## Typed pipeline

Java is statically typed and the ecosystem leans into it hard:

| Stage | Tool | Why |
|---|---|---|
| ORM / schema | JPA + Hibernate (default), jOOQ for SQL-first | JPA is the Spring default; jOOQ when the team prefers SQL as the source of truth. |
| API contract | springdoc-openapi (OpenAPI from annotations) | Generates the OpenAPI doc from `@RestController` annotations; pairs with codegen for clients. |
| Client | `openapi-generator` | Generates typed clients in any target language from the springdoc-emitted spec. |
| Validation | Bean Validation (`jakarta.validation`) | Annotations on DTOs (`@NotNull`, `@Size`, `@Valid`); enforced at the controller boundary. |

When oc-app-architect Phase 2 detects a first-party API surface and oc-stack-forge picks
Java + Spring, control passes to `oc-api-dev` to materialise the OpenAPI chain via
springdoc + openapi-generator.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| AWS ECS / Fargate | Enterprise Java services | The canonical home. Container the JAR; ALB in front; CloudWatch logs. The opchain default for Java. |
| AWS Elastic Beanstalk | Lift-and-shift WAR deployments | Older but still common in regulated industries; lower operational burden than ECS. |
| Kubernetes (EKS / GKE) | Multi-service deployments | When the org already runs k8s. Pair with Spring Cloud Kubernetes for config + discovery. |
| Heroku | Small Spring Boot services | Easiest path for sub-50-MAU prototypes. Loses cost-efficiency above small scale. |
| Render | Heroku-style alternative | Same shape as Heroku, often cheaper. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the hardcoded
matrix in `SKILL.md`.

## Cost band (2026-Q2, rough)

| Tier | ECS Fargate | Beanstalk | Heroku |
|---|---|---|---|
| Hobby | $15–25 (smallest task) | $0 (single t3.micro) | $7 (eco dyno) |
| Small team (10K MAU) | $80–150 (HA pair + ALB + RDS) | $50–100 | $50–100 + Postgres add-on |

JVM-on-container always carries a memory-floor cost the edge runtimes don't — even an
idle Spring Boot app wants ~256 MB. Factor that into hobby-tier numbers. Check vendor
pricing at decision time.

## Gotchas oc-stack-forge will flag

- **Cold start on serverless** — Lambda + Spring Boot is a known pain point.
  Stack-forge will advise GraalVM native image (via Spring Native or Quarkus) when the
  workload is serverless. Otherwise, run on ECS / EKS to amortise the warm-up cost.
- **JPA N+1 queries** — eager-vs-lazy fetching defaults bite production. Stack-forge's
  audit pass flags `@OneToMany` without explicit fetch strategy and missing `@EntityGraph`
  on iterated reads.
- **Memory pressure on small instances** — JVM with default heap settings will OOM on
  256 MB containers. Stack-forge bakes `-XX:MaxRAMPercentage=75` and a sane G1GC
  config into its scaffolds.
- **Dependency conflicts (Maven dependency hell)** — transitive dependency overlap is
  the #1 build-failure cause. Use `mvn dependency:tree` to debug; pin versions
  explicitly in `<dependencyManagement>` for shared libs.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.java.enabled` defaults to `true`). JVM 17 LTS is the canonical
target; 21 LTS is supported. Older Java EE / JEE servers (WebLogic, WebSphere) are
out of scope.
