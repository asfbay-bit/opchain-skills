# iOS (SwiftUI) — release checklist

Shipping an iOS app is **checklist-driven, not automated.** App Store review
windows, code-signing, and Apple's metadata gates make every release a
multi-step human process. `oc-stack-forge` renders this doc verbatim via
`dispatchMobile("ios-swiftui")` rather than executing a deploy command —
the agent should walk the operator through the steps below, not try to
`xcrun altool` its way to production.

The full submission path takes ~24-72 hours on the standard review queue;
budget more for first-time apps (App Store Connect setup, banking + tax,
agreements). TestFlight internal builds skip review entirely; external
TestFlight builds get a much shorter beta review (often < 24h).

## Phase 0 — One-time setup (do this once per app)

1. **Apple Developer Program** enrollment ($99/year individual; $99/year
   organization with D-U-N-S number). Org enrollment is the bottleneck —
   D-U-N-S verification can take a week.
2. Register a **bundle identifier** in the Developer portal
   (`com.<org>.<app>`). Once shipped, this is permanent — renames mean a
   new app listing.
3. Generate **Distribution certificate** + **App Store provisioning
   profile** for the bundle ID. Easiest path: let Xcode "Automatically
   manage signing" handle this; explicit path: use Fastlane Match or
   manual portal management.
4. Create the **App Store Connect** app record (App Name, primary
   language, bundle ID, SKU). The App Name reserves the listing.
5. Wire **banking + tax** in App Store Connect → Agreements. Paid apps
   and in-app purchases are blocked until this clears.
6. Wire **App Privacy** disclosures (App Store Connect → App Privacy).
   Declare every category of data your app collects, including SDK
   collection (analytics, crash reporters, ad SDKs). Missing disclosures
   are a fast-track rejection.

## Phase 1 — Pre-build readiness

1. **Bump `MARKETING_VERSION`** (the public-facing semver, e.g. `1.4.0`)
   in the Xcode project's build settings (or `Info.plist`'s
   `CFBundleShortVersionString`).
2. **Bump `CURRENT_PROJECT_VERSION`** (the build number) — this must be
   monotonically increasing across all uploads with the same marketing
   version. Common pattern: CI sets `CURRENT_PROJECT_VERSION = <CI build
   number>` so it ticks automatically.
3. Verify the **iOS Deployment Target** in the project matches what the
   App Store listing claims. Targeting too new strands users; too old
   silently disables newer SwiftUI features.
4. Run `swift test` (library targets) and `xcodebuild test -scheme
   <App>` (app target with XCUITest) and confirm both green.
5. Run `swiftlint` and resolve any errors (warnings are policy-by-team).
6. Confirm **Privacy Manifest** (`PrivacyInfo.xcprivacy`) declares every
   required-reason API the app uses. Apple's required-reason categories
   are documented in the App Privacy section of App Store Connect.

## Phase 2 — Archive + upload

1. In Xcode: `Product` → `Archive` (select a generic iOS Device or
   "Any iOS Device" — archiving against a simulator is a common
   beginner mistake and produces an invalid archive).
2. In the Organizer that opens: `Distribute App` → `App Store Connect`
   → `Upload`. Xcode runs validation against Apple's current rules
   (missing icons, deprecated APIs, oversized binaries) before the
   upload finishes. Fix and re-archive any failures.
3. CLI alternative: `xcodebuild -exportArchive` + `xcrun altool
   --upload-app` (deprecated, prefer `xcrun notarytool` for macOS) or
   Fastlane's `pilot` / `deliver` lanes. CI typically runs this via
   the Fastlane lane.
4. Wait for the **processing** step in App Store Connect (~10-30
   minutes). Once processing is done the build appears under TestFlight
   → Builds, with an "Export Compliance" prompt — answer it (most apps
   use only standard HTTPS = "no encryption documentation required").

## Phase 3 — TestFlight (internal)

1. Add internal testers (App Store Connect → Users and Access; max 100).
   Internal testers see new builds **without review** within ~10
   minutes of build processing.
2. Notify the team; collect smoke-test feedback through the TestFlight
   app's built-in screenshot + comment flow.
3. Iterate freely — internal TestFlight builds are uncapped and skip
   review. Bump `CURRENT_PROJECT_VERSION` on each rebuild.

## Phase 4 — TestFlight (external, optional)

1. Create an external testing group (App Store Connect → TestFlight →
   External Groups). Up to 10,000 testers per app.
2. Submit the build for **Beta App Review**. This is a lighter review
   than the App Store review (often < 24h, sometimes minutes); Apple is
   mainly checking for crashes, content violations, and missing
   metadata.
3. Once approved, the build goes live to external testers automatically.
   Subsequent builds with the same marketing version can ride along
   without re-review unless major changes trigger a re-evaluation.

## Phase 5 — App Store submission

1. **Screenshots and previews**. Per device-class screenshot sets are
   required: 6.7", 6.5", 5.5" iPhone, plus 12.9" iPad (Pro 6th gen)
   and 12.9" iPad (Pro 2nd gen) for iPad apps. Apple auto-derives
   smaller sizes from the largest if you check the box. Optional
   per-locale screenshot sets if you ship multiple App Store locales.
2. **Metadata**: app name (30 char), subtitle (30 char), promotional
   text (170 char, editable post-submission), description (4000 char),
   keywords (100 char, comma-separated, no spaces), support URL,
   marketing URL, copyright. Locale-specific overrides allowed.
3. **App Review Information**: contact info, demo account credentials
   (Apple's reviewer needs to log in if the app requires auth), review
   notes (explain anything non-obvious to the reviewer, e.g. "tap the
   coffee icon to access the rewards screen").
4. Pick the build you've already uploaded (from the TestFlight pool).
5. Pick a **release strategy**: manual, automatic on approval, or
   scheduled. Manual is the safest for first-time and high-stakes
   releases — gives you a window to verify nothing slipped.
6. **Submit for Review**. Wait for the standard review queue (~24-72
   hours, sometimes longer for new apps or contentious categories).

## Phase 6 — Expedited review (when justified)

Apple offers expedited review for crash-fix releases and time-sensitive
fixes (broken auth, critical security patches, regulatory deadlines).
Request via the App Store Connect → Contact Us → Request Expedited
Review form. Reasonable use only — overuse loses the privilege for the
account. Approved expedites typically clear review in 2-12 hours.

## Phase 7 — Post-release verification

1. Confirm the **public App Store listing** updated (link works,
   screenshots match, version number bumped).
2. Watch **crash-free sessions** in App Store Connect's analytics for
   the first 24-48 hours. Most regressions surface in the first day.
3. Monitor **App Store Connect reviewer messages**. Apple occasionally
   raises post-approval policy questions; missing the reply window
   (usually 14 days) can pull the app from sale.
4. If a regression slips: prepare a hotfix build, run Phases 1-5 again,
   and request **expedited review** with a clear "critical regression"
   justification.

## Common rejection reasons (oc-stack-forge will warn ahead)

- **Missing or inaccurate App Privacy disclosures.** Every SDK that
  touches user data must be reflected.
- **Required-reason API in Privacy Manifest is empty or wrong.**
  Common after pulling in a new third-party SDK.
- **Broken or sandbox-prohibited functionality.** "Test it in a fresh
  install on a real device" — reviewers will.
- **Demo credentials don't work.** Single most common review note.
- **Subscriptions / IAP missing localized pricing or missing the
  Restore Purchases button.**
- **Sign in with Apple is missing** when the app offers third-party
  social login (Google, Facebook, Twitter, etc.). Apple requires
  parity.
- **Screenshots show unrelated content** (Android UI elements, web
  mockups, simulated-but-not-actually-available features).
- **App is "primarily a webview"** with thin native shell. Crosses
  Apple's minimum-functionality bar.

## Code-signing identities at a glance

| Identity | Use | Where it lives |
|---|---|---|
| Apple Development | Builds to physical devices for debugging | Per-developer; Xcode → Settings → Accounts |
| Apple Distribution | Signs App Store + Ad Hoc + Enterprise builds | Team-wide; rotated annually |
| Provisioning profile (Development) | Pairs a Development cert with specific devices and entitlements | Per app, per environment |
| Provisioning profile (App Store) | Pairs a Distribution cert with a bundle ID for store submission | Per app; auto-managed by Xcode is the default |
| Push notification certificate (APNs) | Server-side authentication to send pushes | Backend only; key-based auth (`.p8`) preferred over cert-based (`.p12`) |

For CI: ship the Apple Distribution cert + provisioning profile into the
runner's keychain. Fastlane's `match` is the standard pattern; Xcode
Cloud handles it natively.

## What oc-stack-forge does NOT do for iOS releases

- No `git push` shortcut for production. Submission is human + review.
- No `wrangler deploy` equivalent. The closest analogue is `fastlane
  release`, but it still goes through App Store Connect upload + review.
- No automatic version bump. Marketing version is product-driven, not
  tooling-driven; build number can be CI-derived but oc-stack-forge does
  not pick the scheme for you.

That is the deliberate output of `dispatchMobile`: the user gets a
checklist, not a one-command deploy.
