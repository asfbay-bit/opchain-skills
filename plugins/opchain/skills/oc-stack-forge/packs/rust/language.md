# Rust

The correctness-and-performance choice. Stack-forge picks Rust when the team
wants compile-time guarantees that Go's type system can't express, when the
workload is library-shaped (parsers, codecs, financial calc), or when
end-to-end memory safety is a hard requirement. The learning curve is real;
don't pick Rust because it's fashionable.

## When to pick it

- Performance-critical APIs where Go would already win on latency but you
  also need zero-overhead abstractions (algorithmic Hot paths, codecs,
  cryptographic primitives).
- Library-shaped applications — financial calc engines, parsers,
  domain-specific compilers, anything that produces other code.
- WASM targets where Rust's compile pipeline (`wasm-bindgen`,
  `wasm-pack`) is the most mature in the ecosystem.
- Systems-adjacent work that wants strong correctness — database engines,
  network stacks, embedded.

Skip when: the team has no Rust experience and the app is CRUD-heavy
(Django/Rails ship dramatically faster), or when iteration speed matters
more than runtime guarantees (compile times are real overhead), or when the
ecosystem doesn't yet have the library you need (always check before
committing).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `cargo test` | Built-in; integration tests live in `tests/`, unit tests inline with `#[cfg(test)]`. |
| Build | `cargo build` | `cargo build --release` for production binaries. |
| Lint | `cargo clippy -- -D warnings` | Treat clippy warnings as errors in CI. |
| Format | `cargo fmt --check` (CI), `cargo fmt` (local) | Non-negotiable; idiomatic projects fail CI on unformatted code. |
| Type checker | Built into `rustc` | Strict by default; no separate checker. The borrow checker IS the type checker. |
| Package manager | `cargo` | One canonical answer; lockfile-driven; reproducible builds. |
| Toolchain | `rustup` | Pin via `rust-toolchain.toml` in the repo. |

## Frameworks (land in later v1.4 PRs)

These are the rust-language frameworks oc-stack-forge will recommend once their
packs ship in PRs 4-7:

- **Axum** (preferred) — Tokio-native, tower middleware ecosystem,
  type-safe extractors. The default Rust web framework.
- **Actix Web** — high-throughput, actor-based; mature but uses its own
  runtime model.
- **Rocket** — ergonomic; macro-heavy; pick when DX > raw performance.

PR 2 ships the language pack only. Framework packs (and the bidirectional
`frameworks: [axum, actix-web, rocket]` entry on this pack) arrive in
PRs 4-7.

## Typed pipeline

`DB schema → diesel/sqlx generated types → handlers → utoipa OpenAPI →
openapi-typescript client`.

| Stage | Default | Alternative | Notes |
|---|---|---|---|
| ORM / schema | `sqlx` (preferred) | Diesel, SeaORM | sqlx checks queries against a live DB at compile time — closest thing Rust has to a typed query pipeline. Diesel is heavier but fully ORM-shaped. |
| Migrations | `sqlx migrate`, `refinery` | `diesel migration` | Pick whichever the ORM uses; do not mix. |
| API contract | `utoipa` (OpenAPI derive macros) | `aide`, `paperclip` | `utoipa` generates the spec from handler signatures; minimal annotation overhead. |
| Validation | `validator` crate | `garde` | Both support derive-macro field-level rules; `validator` is more common. |
| Client | `openapi-typescript` | typeshare for cross-language types | OpenAPI for REST clients; typeshare when sharing Rust types directly to TS / Kotlin / Swift consumers. |

When oc-app-architect Phase 2 detects a first-party API surface and oc-stack-forge
has picked Rust, control passes to `oc-api-dev` to author the contract via
`utoipa` (or spec-first if the API has non-Rust producers) and generate the
SDK.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Shuttle.rs | Most new Rust services | Postgres + secrets provisioning out of the box; "infra as code in your `main.rs`" maps cleanly onto Rust's strict-by-default model. The default oc-stack-forge pick. |
| Fly.io | Apps wanting regional placement | Multi-region Postgres, regional VMs; works well for latency-sensitive APIs. |
| AWS Lambda | Bursty workloads in existing AWS | Cold starts are excellent with `cargo-lambda`; pair with API Gateway. |
| Cloudflare Workers (WASM) | Edge-deployed Rust via `workers-rs` | Smaller subset of Rust available; ideal for parsers/codecs running at the edge. |
| Self-hosted Linux VPS | Simplest possible | Static binary + systemd unit + nginx — Rust binaries are even smaller than Go's once stripped. |

Deploy-target packs land alongside framework packs in PRs 4-7.

## Cost band (2026-Q2, rough)

| Tier | Shuttle.rs | Fly.io |
|---|---|---|
| Hobby | $0 (free tier) | $0 (3 shared-cpu-1x) |
| Small team (10K MAU) | $25 – $60 (Pro tier) | $20 + Postgres cluster |

Rust's footprint is comparable to Go's at runtime; the cost driver is the
team learning curve, not infrastructure. Stack-forge will not recommend
Rust to a team without prior exposure unless the workload genuinely demands
it.

## Gotchas oc-stack-forge will flag

- **Compile-time tax** — `cargo build` on a non-trivial workspace can take
  minutes. Stack-forge bakes `sccache` and Cranelift-backend dev builds
  into its scaffolds to keep iteration under control.
- **Async runtime fragmentation** — Tokio is the default but the ecosystem
  has historically split with async-std. Stack-forge picks Tokio
  unconditionally; don't mix runtimes within a single binary.
- **`unsafe` is contagious** — pulling an `unsafe`-using crate doesn't make
  your code unsafe, but it does make audit harder. Stack-forge flags new
  `unsafe` blocks in handler code; library code is fine if well-justified.
- **`Result<T, Box<dyn Error>>` everywhere** — convenient in scripts,
  painful in production. Stack-forge recommends `thiserror` for library-
  visible errors and `anyhow` only at the binary boundary.
- **Cross-compilation** — Rust supports it, but oc-stack-forge defaults to
  building in the target environment (CI for Linux x86_64, GitHub Actions
  runners). Don't promise macOS dev → Linux prod parity without testing.

## Status

`stable` — full coverage. Default visible (`skills.coverage.rust.enabled`
defaults to `true`). No deprecation path planned.
