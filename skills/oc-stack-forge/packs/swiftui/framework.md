# SwiftUI

Apple's declarative UI framework — the default Swift application framework
since iOS 15 and the only forward-looking story across all six Apple
platforms (iOS, iPadOS, macOS, watchOS, tvOS, visionOS). Stack-forge picks
SwiftUI automatically when the language pack is `swift` and the surface is a
user-facing app.

## When to pick it

- Any greenfield iOS / iPadOS / macOS app with a deployment target of iOS 15
  (macOS 12) or later.
- Apps that need to span multiple Apple platforms with a shared codebase —
  SwiftUI's view layer is the cross-platform contract.
- watchOS or visionOS apps — SwiftUI is the only first-class option there.
- Hybrid projects with existing UIKit code: SwiftUI bridges in via
  `UIViewControllerRepresentable` and `UIHostingController`, so new surfaces
  can land in SwiftUI without a full migration.

Skip when: the deployment target must support iOS 13 or below, the surface
needs bespoke gesture pipelines or low-level animation that fights SwiftUI's
declarative model, the team has heavy UIKit muscle memory and zero appetite
for the SwiftUI learning curve, or the app is essentially a wrapper around
a single AVFoundation / MetalKit canvas (UIKit + a Metal view is simpler).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `swift test` + XCUITest | Unit tests via SwiftPM; UI snapshot tests via XCUITest (Xcode-driven). |
| Build | `xcodebuild -scheme <App>` (for App bundles) / `swift build` (libraries) | App targets must go through Xcode for asset catalogs + entitlements. |
| Lint | `swiftlint` | Inherits from the Swift language pack's config. |
| Live preview | Xcode Previews | `#Preview { … }` macro (Swift 5.9+) renders views in the canvas without a full app launch. |
| Snapshot | `swift-snapshot-testing` (pointfree) | Optional; pins SwiftUI output to PNG / text fixtures for regression catching. |

## When oc-stack-forge picks SwiftUI

```
language = swift
purpose ∈ {ios-app, macos-app, watchos-app, visionos-app, tvos-app}
deployment-target ≥ iOS 15 / macOS 12 / watchOS 8 / tvOS 15
→ SwiftUI
```

When the workload is "library only" or "command-line tool", oc-stack-forge
stays on the `swift` language pack without a framework selection. When the
deployment-target floor is older than iOS 15, oc-stack-forge advises UIKit and
flags the version constraint.

## State management

| Tool | When | Notes |
|---|---|---|
| `@State` | View-local UI state | Strings in fields, toggle states, sheet presentation flags. |
| `@Binding` | Passing mutable state into child views | The SwiftUI equivalent of a callback prop. |
| `@Observable` macro (iOS 17+) | Model objects with multiple consumers | Replaces `ObservableObject` + `@Published` from earlier SwiftUI. |
| `@Bindable` (iOS 17+) | Binding into `@Observable` properties | Used inside child views; declares which property is two-way. |
| `@Environment` | Cross-cutting state (theme, locale, focused window) | App-shell injection without prop drilling. |
| Architecture pattern | TCA (The Composable Architecture), MV, MVVM-lite | Stack-forge does not pick for you; default is "@Observable model + small views, no DI framework." |

For projects with iOS 16 / older deployment targets, fall back to
`ObservableObject` + `@Published` + `@StateObject` / `@ObservedObject` —
those still ship in modern SwiftUI for back-compat.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| App Store (via `app-store` pack) | Public consumer iOS apps | Standard distribution. Apple Developer Program required. |
| TestFlight | Pre-release beta | Up to 10,000 external testers; review-light. |
| Enterprise distribution | Internal corporate apps | Apple Developer Enterprise Program; not for App Store apps. |
| Mac App Store / Notarization | macOS apps | MAS for sandboxed apps; notarization for direct DMG / pkg distribution. |

`oc-stack-forge` calls `dispatchMobile("ios-swiftui")` for the deploy step. That
renders the App Store release checklist from `ios-swiftui/mobile.md`
verbatim — no executable command is generated, because submission is a
review-gated process.

## Gotchas oc-stack-forge will flag

- **NavigationStack vs NavigationView.** NavigationView is deprecated in
  iOS 16+; new code should use `NavigationStack` + `NavigationPath`. Mixed
  use inside a single screen breaks back-navigation animation; pick one.
- **Identifiable + List performance.** `ForEach` over a non-`Identifiable`
  collection forces SwiftUI to diff by index, which thrashes on inserts.
  Stack-forge's audit pass flags `ForEach` that uses `id: \.self` on
  reference-type models.
- **Layout in scroll views.** SwiftUI's lazy stacks (`LazyVStack`,
  `LazyHGrid`) are required for long lists; the eager stacks render every
  child at layout time. The smoke test: scroll a 1000-item list and check
  for jank.
- **Async image loading.** `AsyncImage` is fine for low-frequency surfaces;
  use Kingfisher or Nuke for cache + memory control on dense feeds.
- **Previews break on missing dependencies.** Xcode Previews run a slimmer
  build than the full app; environment injection that works at runtime can
  crash the preview canvas. Wrap preview-only dependencies in a `#if
  DEBUG` `PreviewProvider` shim.
- **Accessibility traits.** SwiftUI auto-derives many traits but custom
  controls (gesture-only views, hand-rolled buttons) lose VoiceOver
  semantics. Stack-forge flags custom `.onTapGesture` taps that aren't
  inside a `Button` and lack an `.accessibilityAddTraits(.isButton)`.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.swiftui.enabled` defaults to `true`). SwiftUI on iOS 15+
is the canonical target; older deployment-target apps stay on UIKit and
the bare Swift language pack.
