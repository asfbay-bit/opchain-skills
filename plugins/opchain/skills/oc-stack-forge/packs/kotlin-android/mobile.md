# Android (Kotlin) release checklist

Stack-forge picks `kotlin-android` for native Android apps written in
Kotlin against the Jetpack / Compose stack. This pack is **checklist-
driven**: the dispatch envelope (PR 3, `dispatchMobile()`) renders the
steps below verbatim instead of executing commands. Play Console review
is the gate, not `git push`.

## When to pick it

- Native Android app where the team wants direct Jetpack Compose, full
  access to the platform SDK, and no JS bridge tax.
- Workloads with platform-specific hardware integration: Camera2,
  WorkManager, foreground services, Bluetooth/NFC, MLKit on-device.
- Teams already shipping Kotlin elsewhere (server-side Ktor / Spring)
  that want one language across the stack.

Skip when the app needs to ship on iOS in lockstep (use `flutter` or
`react-native-expo`), or when the surface is a thin wrapper around a
web view (a PWA + Trusted Web Activity is cheaper).

## Toolchain

| Concern | Tool | Notes |
|---|---|---|
| IDE | Android Studio (Koala+ / 2024.x or newer) | The official IDE; tracks the Gradle plugin version. |
| Build | Gradle + Android Gradle Plugin (AGP) | `./gradlew :app:bundleRelease` for the upload artifact. |
| Language | Kotlin 2.x | K2 compiler stable; KSP for annotation processing. |
| UI | Jetpack Compose (preferred), or Views + XML | Stack-forge defaults to Compose for new packs. |
| Test runner | JUnit 5 + AndroidJUnitRunner, Espresso for UI | `./gradlew test` (unit) + `./gradlew connectedAndroidTest` (instrumented). |
| Static analysis | `./gradlew lint`, ktlint, detekt | Lint baseline committed; CI fails on new warnings. |
| Crash reporting | Firebase Crashlytics or Sentry | Wire before first internal-track upload. |

## Build artifacts

Play Console accepts two formats:

- **App Bundle (`.aab`)** — required for new apps since 2021. Google
  Play repacks it per-device into smaller APKs (Dynamic Delivery).
- **APK** — legacy, still accepted for ad-hoc / sideload distribution
  but not for new Play submissions.

Command: `./gradlew :app:bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`.

## Signing keys

Two keys, do not confuse them:

- **Upload key** — what your CI / laptop signs the `.aab` with before
  uploading to Play Console. Rotatable; you can ask Google to reset.
- **App signing key** — what Google re-signs the per-device APKs with
  before serving them to users. Managed by **Play App Signing**; the
  private key never leaves Google's KMS. This is the user-trust anchor
  and cannot be rotated without losing the install base.

Stack-forge assumes Play App Signing is enrolled (default for new
apps). The upload key lives in `keystore.jks` referenced from a
`gradle.properties` that is **gitignored**; CI reads it from a secret.

## Versioning

`versionCode` (monotonic integer, drives Play update logic) and
`versionName` (display string, e.g. `1.4.0`) live in
`app/build.gradle(.kts)`. Stack-forge convention: derive `versionCode`
from CI build number, `versionName` from semver of the release tag.
Never reuse a `versionCode` — Play rejects duplicates.

## Release tracks (Play Console)

| Track | Audience | Use for |
|---|---|---|
| Internal testing | Up to 100 listed testers, instant | Smoke-test the upload artifact end-to-end before any external eyes. |
| Closed testing | Lists of testers, days to review | Beta cohort, dogfood. Required for new-app pre-launch report. |
| Open testing | Anyone with the link | Public beta; counts against the install base. |
| Production | All eligible devices | The real release. Staged rollout (1% → 5% → 20% → 50% → 100%) is the default. |

Reviews for internal-track uploads are minutes; closed/open are hours;
production is typically a few hours to ~1 day. Faster than App Store
but not instant — plan submission for a weekday morning so the rollback
window is in business hours.

## Pre-submit checklist

1. `versionCode` bumped; `versionName` matches the git tag.
2. ProGuard / R8 rules verified — release variant smoke-tested on a
   physical device, not just the emulator.
3. `./gradlew :app:lint` clean against the baseline.
4. Crash reporter wired and verified in a debug build.
5. Privacy policy URL + data-safety section filled in (Play Console
   refuses production submissions without these).
6. Content rating questionnaire completed.
7. Screenshots + feature graphic uploaded (phone + tablet + Wear /
   Auto / TV as applicable).
8. Pre-launch report (auto-generated from the closed-testing upload)
   passes — no crashes, no accessibility flags.

## Play Asset Delivery (large assets)

For games or apps shipping >150MB of assets, use Play Asset Delivery:

- `install-time` — bundled into the initial install.
- `fast-follow` — downloads in the background right after install.
- `on-demand` — fetched at runtime via `AssetPackManager`.

Keeps the base `.aab` small enough for Play's per-download caps.

## Common gotchas

- **64-bit requirement** — all native libs must ship `arm64-v8a` (and
  optionally `x86_64`). Play rejects `.aab`s with only 32-bit ABIs.
- **Min SDK creep** — bumping `minSdk` cuts the install base; check the
  Play Console device-catalog stats before raising it.
- **Foreground service types** (Android 14+) — every foreground service
  must declare a `foregroundServiceType` matching its purpose, with the
  matching permission. Missing declaration = silent crash at start.
- **Target SDK deadline** — Play enforces a rolling target-SDK floor
  (currently `targetSdk` must be within ~1 year of the latest API).
  Plan upgrades on a yearly cadence.

## Status

`stable` — full coverage. `skills.coverage.kotlin-android.enabled`
defaults to `true`. Cross-platform alternatives: `flutter` (single
codebase, both stores) or `react-native-expo` (JS + Expo cloud builds).
