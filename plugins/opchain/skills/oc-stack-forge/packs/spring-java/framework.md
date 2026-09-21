# Spring Boot (Java)

Spring Boot is the dominant Java web framework — and the default story inside
enterprise JVM shops. It pairs Spring's IoC container with auto-configuration,
embedded servers (Tomcat/Jetty/Undertow), production-grade actuators, and a sprawling
ecosystem (Spring Data, Spring Security, Spring Cloud) that covers everything from
JPA to OAuth to distributed tracing. Stack-forge picks Spring Boot automatically when
the language pack is `java` and the surface is web-facing.

## When to pick it

- Any web-facing Java service: REST APIs, GraphQL services, server-rendered UIs,
  enterprise integrations.
- Transactional backends with rich domain models — Spring Data JPA + Hibernate is
  the canonical path for everything from CRUD to event sourcing.
- Teams that already run Spring in production. The on-call, observability, and
  deployment muscle memory is reusable across services.
- Workloads that benefit from the Spring ecosystem: Spring Security for auth/OAuth,
  Spring Cloud for service mesh, Spring Batch for scheduled jobs, Spring Integration
  for ESB patterns.

Skip when: cold start matters (Lambda-style serverless — Spring Boot wants 3-8s to
boot; pick Quarkus or Micronaut for native-image-friendly alternatives); the workload
is a CLI or pure library (plain Java + a build tool is fine); the team wants
microservice-shaped Kotlin (use spring-kotlin instead — same framework, idiomatic
Kotlin syntax).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `mvn test` | JUnit 5 + `spring-boot-starter-test` includes Mockito, AssertJ, JsonPath. `@SpringBootTest` for integration tests; `@WebMvcTest` for controller slices. |
| Build | `mvn package` | Produces an executable fat-jar (Spring Boot Maven plugin). `mvn spring-boot:run` for local dev. |
| Lint | `mvn checkstyle:check` | Same as Java base. Spring Boot starters have a clean checkstyle profile. |
| Asset pipeline | None built-in | Spring Boot serves static assets from `src/main/resources/static/`. Pair with a JS bundler when the project includes frontend code. |
| Generator | `spring init` (Spring Initializr CLI) | Idiomatic project bootstrap; oc-stack-forge defers to this for greenfield. |

## When oc-stack-forge picks Spring Boot

The language → framework decision is short:

```
language = java
purpose ∈ {web-api, web-app, internal-tool, enterprise-integration}
→ Spring Boot
```

When the workload is "library", "CLI tool", or "Lambda-style serverless with cold-start
sensitivity", oc-stack-forge picks plain Java (or Quarkus, advisory-only in v1.4).

## Idiomatic Spring layout

Stack-forge scaffolds use a layered architecture by default:

```
src/main/java/com/example/app/
├── Application.java          # @SpringBootApplication entrypoint
├── config/                   # @Configuration beans, security, web config
├── controller/               # @RestController HTTP handlers
├── service/                  # @Service business logic
├── repository/               # @Repository JPA / data access
└── domain/                   # JPA entities + value objects
```

DTOs separate from JPA entities at the controller boundary — oc-stack-forge audits flag
controllers returning entities directly (lazy-load + serialisation footguns).

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| AWS ECS / Fargate | The opchain default for Spring Boot | Container the fat-jar; ALB in front. Pair with RDS for Postgres, CloudWatch for logs. |
| AWS Elastic Beanstalk | Lift-and-shift WAR deployments | Lower operational burden than ECS; common in regulated industries. |
| Kubernetes (EKS / GKE) | Multi-service deployments | Spring Cloud Kubernetes for config + service discovery. |
| Heroku | Small Spring Boot apps | Easy onboarding; the official Java buildpack works fine. |
| Render | Heroku-style alternative | Same shape as Heroku, often cheaper. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the hardcoded
matrix in `SKILL.md`.

## Gotchas oc-stack-forge will flag

- **N+1 JPA queries** — `@OneToMany` defaults to `LAZY`, which fires a query per access
  in iteration. Stack-forge audits flag iteration over entity collections without
  `@EntityGraph` or explicit `fetch join` queries.
- **Cold start on serverless** — Spring Boot's startup time (3-8s) makes Lambda
  painful. Stack-forge advises GraalVM native image via Spring Native, or pivoting to
  Quarkus/Micronaut, when the deploy target is serverless.
- **Controller returning entity** — exposes the JPA model to the wire, leaks lazy
  proxies, and couples HTTP shape to DB shape. Stack-forge audits flag any controller
  method returning an `@Entity` type directly. Use a DTO.
- **`@Autowired` on fields** — field injection is convenient but breaks constructor
  immutability and complicates testing. Stack-forge audits flag field injection in new
  code; prefer constructor injection.
- **Memory floor in small containers** — Spring Boot with default heap will OOM on
  256 MB. Stack-forge scaffolds set `-XX:MaxRAMPercentage=75` and a sane G1GC config.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.spring-java.enabled` defaults to `true`). Spring Boot 3.x is the
canonical target; 2.x is supported but on a deprecation glide. Spring Framework 6
(Jakarta EE namespace) is required.
