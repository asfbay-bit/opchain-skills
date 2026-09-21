# Flutter release checklist

Stack-forge picks `flutter` for cross-platform mobile apps written in
Dart against the Flutter SDK. The pack's `mobilePlatform` is
`flutter` — not `android` or `ios` — because the same codebase ships
to both stores from one toolchain. This pack is **checklist-driven**:
`dispatchMobile()` renders the steps below rather than executing
deploy commands. Store review windows are the gate.

NOTE on supported platforms: as of v1.4 PR 6.5 this pack lists ONLY
`play-store` as `supportedPlatforms`. A follow-up PR after PR 6 lands
(`app-store` adapter) will add `app-store` so Flutter advertises the
full cross-platform reach. The Dart toolchain already supports both
builds today; the limitation is purely the pack-registry adapter list.

## When to pick it

- Single codebase across iOS + Android with native-feeling UI and
  60fps animation budgets.
- Small mobile team that can't sustain two native codebases but
  rejects the React Native bridge tax for performance-sensitive UI.
- Apps with heavy custom UI / animation; Skia (now Impeller) gives
  pixel-perfect control without per-platform widget reimplementation.

Skip when the team is already deep in React + TypeScript (use
`react-native-expo`) or when the app needs deep per-platform
integration that drags in two native engineers anyway (use
`kotlin-android` + an iOS pack).

## Toolchain

| Concern | Tool | Notes |
|---|---|---|
| Language | Dart 3.x | Null-safe; supports records + patterns + sealed classes. |
| SDK | Flutter stable channel | `flutter --version` should match a recent stable tag; pin via `pubspec.yaml` + `.fvmrc` if using FVM. |
| Build (Android) | `flutter build appbundle --release` | Emits `build/app/outputs/bundle/release/app-release.aab`. |
| Build (iOS) | `flutter build ipa --release` | Emits `build/ios/ipa/*.ipa`; needs a macOS host + Xcode. |
| Test runner | `flutter test` (unit + widget), `integration_test` (E2E) | `flutter test --coverage` for line coverage. |
| Static analysis | `flutter analyze` | Reads `analysis_options.yaml`; treat warnings as errors in CI. |
| Formatter | `dart format .` | Opinionated; commit-time check. |
| Codegen | `build_runner` (json_serializable, freezed, etc.) | `dart run build_runner build --delete-conflicting-outputs`. |

## Multi-platform testing

One codebase, two stores, three flavors of test:

- **Unit + widget** — `flutter test` runs in the Dart VM. Fast, no
  device. This is where 80% of coverage should live.
- **Integration** — `flutter test integration_test/` drives a real
  device or simulator via the Flutter driver. Use for golden-image
  regression and platform-channel smoke tests.
- **Device-cloud** — Firebase Test Lab (Android) + Xcode Cloud (iOS)
  for matrix testing across real hardware. Stack-forge recommends
  Test Lab for the pre-launch report on the Play side.

Always smoke-test both platform builds before any submission: a
plugin can compile clean on Android and crash at runtime on iOS (or
vice versa) when the platform channel hits a missing native impl.

## Build pipeline options

| Pipeline | Use when |
|---|---|
| **Direct Play Console upload** | `flutter build appbundle` locally, upload `.aab` by hand. Simplest; fine for early stages. |
| **EAS Build (Expo)** | Cloud-managed builds; Flutter via EAS is supported but less common than for RN. Best when the team already runs Expo for sibling JS projects. |
| **Codemagic** | Flutter-native CI/CD; cleanest signing + Fastlane integration for the cross-platform case. Stack-forge default for non-trivial setups. |
| **GitHub Actions + Fastlane** | Self-hosted; full control. Requires a macOS runner for iOS builds. |

For PR 6.5 oc-stack-forge defaults to **direct Play Console upload** for
the Android side and defers the iOS side until the `app-store`
adapter lands.

## Versioning

Single source of truth in `pubspec.yaml`:

```yaml
version: 1.4.0+42
```

The part before `+` is `versionName` (iOS `CFBundleShortVersionString`
+ Android `versionName`). The part after `+` is the build number
(iOS `CFBundleVersion` + Android `versionCode`). Increment the build
number on every store upload; never reuse it on either store.

## Pre-submit checklist (Android side)

1. `pubspec.yaml` version bumped (`x.y.z+n`).
2. `flutter analyze` clean against the project's analysis_options.
3. `flutter test` + `integration_test` green.
4. `flutter build appbundle --release` succeeds and the resulting
   `.aab` runs on a physical device (Profile-mode at minimum).
5. Crash reporter (Sentry / Crashlytics) verified in the release
   variant.
6. Privacy policy + data-safety section completed in Play Console.
7. Screenshots + feature graphic ready (phone + tablet).
8. Pre-launch report from internal-track upload passes.

## Common gotchas

- **Plugin platform mismatch** — a `pub.dev` package may only
  implement Android or iOS. Read the support matrix before adding.
- **App size** — vanilla Flutter app is ~20MB on Android, ~40MB on
  iOS. Use `--split-per-abi` (Android) or trim assets / fonts before
  worrying about Impeller-specific size.
- **Hot reload vs hot restart vs full rebuild** — only full release
  builds (`--release`) catch tree-shaking / R8 / dead-code issues.
  Never ship without a release-mode smoke test.
- **Web / desktop targets** — Flutter supports them but oc-stack-forge's
  `flutter` pack scopes to mobile. Web/desktop are separate
  conversations.

## Status

`stable` — full coverage. `skills.coverage.flutter.enabled` defaults
to `true`. Cross-platform alternative: `react-native-expo` (JS-based,
heavier OTA story). Native alternative: `kotlin-android` for
Android-only.
