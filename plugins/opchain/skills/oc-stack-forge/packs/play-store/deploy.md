# Google Play (Play Console) deploy adapter

`play-store` is the deploy-target adapter for Android distribution via
the **Google Play Console**. It's a `kind: deploy-target` pack —
sub-selection only — so it **does not generate a coverage flag**.
Mobile packs (`kotlin-android`, `flutter`, `react-native-expo`) list
`play-store` in their `supportedPlatforms` array; oc-stack-forge picks
this adapter when one of those packs is in play and the surface is
Android distribution.

## What oc-stack-forge dispatches here

Unlike the server-side deploy-target packs (Cloudflare, Render, Fly),
the Play Console is **not** an API-first deploy surface. The
`dispatchMobile()` envelope from PR 3 renders the steps below verbatim
as a checklist. oc-stack-forge does not run `gradle publish` or hit the
Play Developer API directly; the human submits via Console UI or the
Gradle Play Publisher plugin from their laptop / CI.

## Submission surfaces

| Surface | Use when | Notes |
|---|---|---|
| **Play Console UI** | Default. Manual upload, manual track promotion. | Cleanest for first releases, content-policy questionnaires, anything requiring a human-in-the-loop. |
| **Gradle Play Publisher plugin** | Automation from CI. | `./gradlew publishReleaseBundle --track internal`. Needs a Google Play service-account JSON with publishing scope. |
| **fastlane supply** | Existing fastlane shops. | Wraps the same API as the Gradle plugin. |
| **EAS Submit** | When the mobile pack is `react-native-expo`. | `eas submit --platform android --latest`; service-account JSON registered in EAS. |

Stack-forge defaults to the **Console UI** path for first releases
and graduates teams to the plugin/fastlane/EAS path once a stable
release cadence is established.

## Release tracks

```
Internal → Closed → Open → Production
```

| Track | Audience | Review window | Use for |
|---|---|---|---|
| Internal testing | Up to 100 listed testers | Minutes | Smoke-test the upload artifact end-to-end. Required first step in oc-stack-forge's pipeline. |
| Closed testing | Lists / Google Groups of testers | Hours | Beta cohort, dogfood. Generates the pre-launch report. |
| Open testing | Anyone with the opt-in link | Hours | Public beta; counts toward install base. Optional. |
| Production | All eligible devices | A few hours – ~1 day for new app submissions; faster on subsequent updates | The real release. Always pair with staged rollout. |

oc-stack-forge convention: every release passes through Internal first.
The Internal-track upload is what generates the **pre-launch report**
that Production submission depends on for the first release of an app.

## Staged rollouts

Production releases default to a staged rollout: surface to a
percentage of users, watch crash / ANR / negative-rating signals,
ramp up. Typical schedule:

```
Day 0:  1%   (initial canary)
Day 1:  5%   (if crash-free > 99.5%)
Day 2: 20%
Day 4: 50%
Day 7: 100%
```

Halt + roll back from the Console at any percentage. Note that
"rollback" on Play Console means **halting the rollout** of the new
version — users who already updated stay updated; only future
auto-updates revert. There is no per-user downgrade.

## Content policy review

Every production submission goes through Play's automated + human
review against the developer programme policies. Common rejection
reasons oc-stack-forge surfaces:

- **Missing or stale privacy policy URL** in the Console listing.
- **Data-safety form** mismatched with what the app actually collects
  (Play cross-checks against detected SDKs).
- **Permissions used without justification** in the listing —
  background location, SMS, call log are heavily scrutinised.
- **Target SDK too old** — Play enforces a rolling floor (typically
  within ~1 year of the latest API level).
- **Misleading metadata** — screenshots that don't reflect the app,
  unsupported claims in the description.

## Service account (CI submissions)

For Gradle Play Publisher / fastlane / EAS Submit:

1. In Google Cloud, create a service account with no roles.
2. In Play Console → Setup → API access, invite the service account
   and grant it **Release manager** + **App access** for the target
   app(s).
3. Generate a JSON key for the service account; store as a CI secret
   (never commit).
4. Wire the JSON into Gradle Play Publisher config (or `eas submit`'s
   service-account-key field).

Stack-forge flags any setup where the JSON ends up in the repo or in
plaintext build output.

## Pre-submit checklist

1. `.aab` built in release mode, signed with the upload key, Play
   App Signing enrolled.
2. `versionCode` not previously used; `versionName` matches the git
   tag.
3. Crash reporter wired and verified.
4. Privacy policy URL valid; data-safety section accurate.
5. Content rating questionnaire submitted.
6. Listing assets (screenshots, feature graphic, short / full
   description, app icon) present for every supported form factor.
7. Internal-track upload smoke-tested on at least one physical
   device per supported ABI.
8. Pre-launch report passes (no crashes, no policy flags).
9. Staged-rollout percentages chosen; on-call coverage scheduled for
   the canary window.

## Common gotchas

- **App signing key loss** — if you opted out of Play App Signing
  and the upload key IS the app signing key, losing it means losing
  the app. New uploads with a different signature get rejected as a
  different app. Stack-forge insists on Play App Signing.
- **Tester list propagation lag** — adding a tester to a Closed
  Testing list can take up to 30 minutes to take effect. Confirm
  before assuming the test cohort is live.
- **Targeting changes** — narrowing the `targetSdk`, screen sizes,
  or device exclusions can shrink the install base silently; review
  the device-catalog impact in the Console before publishing.

## Status

`stable` — full coverage. Sub-selection only (no coverage flag).
Pairs with `kotlin-android`, `flutter`, and `react-native-expo`. The
iOS counterpart `app-store` lands in PR 6 (ADEV-336).
