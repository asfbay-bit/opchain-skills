# Swift

Apple's strongly-typed, value-oriented application language. Stack-forge picks
Swift first when the deliverable is a native iOS, iPadOS, macOS, watchOS, or
visionOS app — anywhere the App Store is the distribution channel and the
runtime is an Apple platform. Outside that envelope Swift loses its leverage
(tooling and library ecosystems on Linux exist but lag), and oc-stack-forge
recommends another language pack instead.

## When to pick it

- Native iOS / iPadOS apps where App Store distribution is the goal.
- macOS desktop apps that want to feel like Apple software (Sandboxing,
  Continuity, the standard menu/preferences pattern).
- watchOS / visionOS / tvOS surfaces — Swift is the only first-class option.
- Apple-platform CLI tooling (`swift build` produces a single-binary executable
  that ships cleanly inside an `.app` bundle).

Skip when: the target audience runs anything other than Apple platforms (use
the relevant native language pack or pick a cross-platform mobile pack such
as `flutter` or `react-native-expo`), the team has no Mac to build on
(Xcode is a hard requirement for App Store submission), or the workload is
backend / data-heavy (other language packs win on ecosystem).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `swift test` | Driven by XCTest under the hood; SwiftPM-native. Xcode also runs the same suites via `xcodebuild test`. |
| Build | `swift build` | Swift Package Manager build. App-bundle builds for the App Store still go through `xcodebuild` / Xcode Cloud. |
| Lint | `swiftlint` | The de-facto community linter. Configure via `.swiftlint.yml`; oc-stack-forge generates a permissive baseline. |
| Format | `swift-format` | Apple's official formatter (Swift 5.8+). Optional but oc-stack-forge assumes it's wired into pre-commit. |
| Package manager | Swift Package Manager (`Package.swift`) | First-party. CocoaPods and Carthage still exist; oc-stack-forge defaults to SwiftPM. |
| IDE | Xcode | Mandatory for App Store builds (code-signing + asset catalogs live in the `.xcodeproj`). VS Code + sourcekit-lsp works for plain library code. |

## Frameworks

- **SwiftUI** — declarative UI; the default for new app surfaces since iOS 15.
  See the `swiftui` framework pack.
- **UIKit** — the imperative predecessor. Still the right call for projects
  that need bespoke gesture pipelines, complex animation timing, or that
  must support iOS 13 and below. Stack-forge does not ship a separate
  UIKit pack in v1.4 — projects that need it stay on the `swift` language
  pack without a framework selection.

App-side concerns Swift owns end-to-end:

| Stage | Tool | Why |
|---|---|---|
| UI | SwiftUI (default) / UIKit (legacy) | SwiftUI for greenfield; UIKit for legacy or complex bespoke surfaces. |
| State | Observation framework (Swift 5.9+), `@Observable`, `@State`, `@Bindable` | Replaces the `ObservableObject` + `@Published` story from earlier SwiftUI. |
| Persistence | SwiftData (iOS 17+) / Core Data | SwiftData for greenfield; Core Data for back-compat. |
| Concurrency | `async/await`, structured concurrency, actors | Avoid `DispatchQueue` for new code. |
| Networking | `URLSession` + `async/await` | `Alamofire` if multipart / retries get hairy, but the stdlib covers ~90%. |

## Default deploy target

| Target | Default for | Notes |
|---|---|---|
| App Store | All iOS / iPadOS / watchOS / tvOS / visionOS apps | The only real distribution channel for consumer apps. Pack id `app-store`; see the deploy-target pack and `mobile.md`. |
| TestFlight | Pre-release builds | Internal (up to 100 testers, no review) and external (up to 10,000 testers, requires a quick beta review). Same `.ipa` artifact as a release. |
| Enterprise (Apple Developer Enterprise Program) | In-house distribution to a single company's employees | Rare; ADEP enrollment is gated and expensive. |
| Notarized DMG / pkg | macOS apps distributed outside the Mac App Store | Still requires Apple Developer code-signing + notarization. |

Mobile deploys are **checklist-driven**, not script-driven — the App Store
review queue is the gate, and `oc-stack-forge` renders the release checklist
from `ios-swiftui/mobile.md` via `dispatchMobile()` rather than executing a
deploy command. See the `app-store` deploy-target pack and the iOS mobile
pack for the full submission flow.

## Cost band (2026-Q2, rough)

| Tier | Apple Developer Program | Notes |
|---|---|---|
| Individual | $99/year | One person, ships to App Store, TestFlight. |
| Organization | $99/year | Multi-seat team, signed by company DBA name. |
| Enterprise | $299/year | ADEP — in-house distribution only, no App Store. Heavily gated. |

Add the cost of at least one Mac capable of running the current Xcode
release (currently Apple Silicon-only for new App Store submissions). Xcode
Cloud is optional — most teams use GitHub Actions with `xcodebuild` runners,
or Bitrise / Codemagic for hosted Mac CI.

## Gotchas oc-stack-forge will flag

- **App Store Connect setup** is the longest-pole task. Bundle ID
  registration, certificates, provisioning profiles, App Store listing,
  app-privacy disclosures, and (for paid apps) banking and tax forms can
  add days even after the code is ready. Stack-forge's mobile checklist
  pulls this in as Phase 0.
- **Code-signing identities** are environment-specific. The `Development`
  identity signs to physical devices; the `Distribution` identity signs
  for the App Store / TestFlight. CI must have the Distribution cert +
  provisioning profile installed in the keychain. Match (Fastlane) or
  Xcode Cloud's managed signing handle this; doing it by hand is a known
  footgun.
- **Xcode-only build steps**. Asset catalogs, Storyboard / XIB compilation,
  Watch app embedding, and Privacy Manifests all run through `xcodebuild`,
  not `swift build`. Library-only projects can stay SwiftPM; app projects
  must go through Xcode at some point in CI.
- **iOS minimum-deployment target.** App Store-approved iOS versions slide
  forward yearly. Targeting too old (< iOS 15) cuts you off from SwiftUI
  features and Observation; targeting too new strands users. Stack-forge
  recommends "current minus 2" as the default floor.
- **SwiftPM vs. CocoaPods coexistence**. New projects should be SwiftPM-only.
  Mixed projects (legacy + new pods) need Xcode's "Resolve Package
  Versions" run before every release build, or CI will resolve stale.
- **Privacy Manifests** (iOS 17+, mandatory 2024-spring onward for SDKs
  that touch sensitive APIs). Missing manifests cause App Store
  submission rejection. Stack-forge's release checklist covers this.

## Status

`stable` — full coverage. Default visible (`skills.coverage.swift.enabled`
defaults to `true`). No deprecation path planned. SwiftUI is the primary
framework; legacy UIKit-only projects stay on the language pack without
a framework selection.
