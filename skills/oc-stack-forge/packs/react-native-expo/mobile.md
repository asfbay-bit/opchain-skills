# React Native (Expo) release checklist

Stack-forge picks `react-native-expo` for cross-platform mobile apps
written in TypeScript/JavaScript against the Expo SDK + EAS Build
pipeline. The pack's `mobilePlatform` is `react-native` — one codebase,
two stores, cloud-managed builds. This pack is **checklist-driven**:
`dispatchMobile()` renders the steps below; the agent does not run
`eas build` or `eas submit` directly.

NOTE on supported platforms: as of v1.4 PR 6.5 this pack lists only
`play-store`. A follow-up after PR 6 lands (`app-store` adapter) will
add `app-store` so the full cross-platform reach is advertised. EAS
already supports both targets today; the gap is purely registry-side.

## When to pick it

- Team already deep in React + TypeScript; sharing types / utilities
  between mobile and web is a real win.
- Want cloud builds out of the box — no macOS host required for iOS,
  no local Android SDK setup for Android.
- Value over-the-air (OTA) JS updates: ship JS-only bugfixes without
  another store review cycle.

Skip when the app is performance-sensitive enough that the JS-to-native
bridge cost matters (use `flutter` for pixel-perfect UI, or
`kotlin-android` natively); or when the team prefers Dart's tooling and
60fps Skia rendering.

## Toolchain

| Concern | Tool | Notes |
|---|---|---|
| Runtime | React Native 0.74+ (New Architecture / Fabric) | Hermes JS engine on by default; JSC available but not the default. |
| SDK | Expo SDK 51+ | Pinned in `package.json`. `npx expo install` keeps native module versions aligned. |
| Build | EAS Build (cloud) | `eas build --platform android` / `--platform ios` / `--platform all`. |
| Submit | EAS Submit | `eas submit --platform android` uploads `.aab` to Play Console. |
| Test runner | Jest (unit + component) + Detox (E2E) | `npm test` for Jest; Detox runs against simulator + device. |
| Static analysis | TypeScript (`tsc --noEmit`) + ESLint | `expo lint` wraps the recommended config. |
| OTA updates | `expo-updates` | Channel + branch + runtime-version model; ship JS-only fixes between store releases. |

## JS engine: Hermes vs JSC

- **Hermes** (default since RN 0.70) — AOT-compiled bytecode, smaller
  install, faster startup. Stack-forge defaults to Hermes.
- **JSC** (JavaScriptCore) — the Safari engine. Larger, slower startup,
  but full V8-ish parity for certain edge-case libraries.

Flip via `app.json`:

```json
{ "expo": { "jsEngine": "hermes" } }
```

Always smoke-test on both Hermes and JSC if the team supports an old
RN version that defaulted to JSC — silently different `Date` /
`Intl` / regex behavior bites here.

## Build pipeline (EAS-first)

1. `eas build --platform android --profile production` runs in EAS
   cloud; output is a downloadable `.aab` artifact URL.
2. `eas submit --platform android --latest` uploads to Play Console
   internal track using the service-account JSON registered in EAS.
3. Promote in Play Console (internal → closed → production) as normal.

For the iOS side (post-PR 6 adapter): `eas build --platform ios` then
`eas submit --platform ios --latest` to TestFlight, then promote.

Local builds (`npx expo run:android`) work for dev but require a full
Android SDK install; oc-stack-forge defaults all release-track builds to
EAS to keep contributor setup minimal.

## Versioning

`app.json` (or `app.config.ts`):

```json
{
  "expo": {
    "version": "1.4.0",
    "android": { "versionCode": 42 },
    "ios": { "buildNumber": "42" }
  }
}
```

Or let EAS auto-increment via `eas.json`:

```json
{ "build": { "production": { "autoIncrement": true } } }
```

Stack-forge prefers auto-increment in CI to avoid manual `versionCode`
collisions across parallel branches.

## OTA updates via expo-updates

JS bundle + asset updates ship without a store review:

```bash
eas update --branch production --message "fix login redirect"
```

Rules of thumb:

- **OTA-safe**: pure JS, asset, image, copy changes.
- **NOT OTA-safe**: native module additions, SDK upgrades, anything
  touching `ios/` or `android/` directories. These need a new build.
- **Runtime version** — bump `runtimeVersion` when shipping a native
  change so old binaries don't pull a JS bundle that depends on the
  new native module.

Staged rollout: EAS supports percentage-based update rollouts; treat
OTA the same as a store release for risk purposes.

## Pre-submit checklist (Android side)

1. `app.json` version bumped; `versionCode` (or auto-increment) set.
2. `tsc --noEmit` + `expo lint` clean.
3. `npm test` (Jest) green; Detox smoke against a release-mode build.
4. EAS build succeeds; download the `.aab` and install on a physical
   device before submitting.
5. Crash reporter (Sentry, Bugsnag) verified end-to-end.
6. Privacy policy + data-safety section filled in.
7. Screenshots + feature graphic uploaded.
8. Pre-launch report passes after internal-track upload.

## Common gotchas

- **Expo Go vs dev client** — Expo Go only runs the Expo SDK's own
  modules. Any custom native module forces a dev-client build. Plan
  ahead; don't ship a Go-only workflow and then need a native module.
- **Bridgeless / New Architecture** — RN 0.74's New Architecture is
  the default for new projects but some popular libraries still need
  interop shims. Verify compatibility before locking the RN version.
- **OTA-painted-into-a-corner** — shipping a buggy OTA can brick the
  app for users on that channel. Always test OTA on a staging branch
  before promoting; expo-updates can roll back via `eas update --republish`.
- **iOS / Android divergence** — even with one codebase, platform
  permissions (notifications, camera, location) differ. Test the
  permission flow on both before submission.

## Status

`stable` — full coverage. `skills.coverage.react-native-expo.enabled`
defaults to `true`. Cross-platform alternative: `flutter` (Dart,
Skia-based). Native alternative: `kotlin-android` for Android-only.
