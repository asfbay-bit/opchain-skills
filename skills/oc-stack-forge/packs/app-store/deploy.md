# App Store

Apple's distribution channel for iOS, iPadOS, watchOS, tvOS, and visionOS
apps — and, separately, the Mac App Store for macOS. From `oc-stack-forge`'s
perspective, App Store is a `kind: deploy-target` pack: the destination an
iOS / iPadOS / watchOS / tvOS / visionOS app ships to, much the way
Cloudflare Workers is a destination for a TypeScript+Hono backend.

**Note on coverage:** deploy-target packs do **not** generate a
`skills.coverage.<id>.enabled` flag — they are sub-selections under a
language / framework / mobile pack rather than independent coverage units.
Whether the App Store target is visible follows from whether the
referring mobile pack (`ios-swiftui`, and PR 6.5's
`kotlin-android` / `flutter` / `react-native-expo` analogues) is enabled.

## Where App Store fits in the adapter graph

```
swift  (language)
   ↓
swiftui  (framework, language=swift)
   ↓
ios-swiftui  (mobile, mobilePlatform=ios)
   defaultPlatform: app-store
   supportedPlatforms: [app-store]
   ↓
app-store  (deploy-target — this pack)
```

When `oc-stack-forge` consults `ios-swiftui` for a deploy adapter, it follows
the `defaultPlatform` edge to this pack. The PR 6.5 cross-platform packs
(`flutter`, `react-native-expo`) declare both `app-store` and `play-store`
in `supportedPlatforms` — `oc-stack-forge` asks the operator which target is
in scope.

## Submission flow

The full release-checklist lives in `ios-swiftui/mobile.md` (rendered by
`dispatchMobile()` at runtime). The shape of the flow:

1. **Archive** an iOS App build via Xcode (`Product → Archive`) or
   `xcodebuild -exportArchive`.
2. **Upload** to App Store Connect via Xcode Organizer, `xcrun altool`,
   `xcrun notarytool` (macOS), or Fastlane `pilot` / `deliver`.
3. **TestFlight** (internal then optionally external) for pre-release
   testing. Internal builds skip review; external testers get a quick
   beta review.
4. **Submit for App Store Review.** Standard review queue: 24-72h.
   Expedited review is available for critical fixes.
5. **Release** (manual / automatic / scheduled). Manual is the default
   `oc-stack-forge` recommends.

## Distinct from `play-store`

The `play-store` pack (PR 6.5) targets Android. Cross-platform mobile packs
(`flutter`, `react-native-expo`) reference **both** in `supportedPlatforms`.
The submission flows are not interchangeable:

| Property | App Store | Play Store |
|---|---|---|
| Review window | 24-72h standard; minutes-hours expedited | Hours to days; faster than Apple in 2026 |
| Code signing | Apple Distribution cert + provisioning profile | Upload key + Play App Signing |
| Beta channel | TestFlight (internal/external) | Internal/Closed/Open testing tracks |
| Metadata gates | App Privacy + Privacy Manifest | Data safety form + permissions declaration |
| In-app purchase | Apple StoreKit | Google Play Billing |
| Cost share | 30% (15% under $1M / year via Small Business Program) | 30% (15% on first $1M / year automatically) |

`oc-stack-forge` does not unify the two. Operators pick one (or both)
explicitly; the release checklist follows.

## Cost band (2026-Q2, rough)

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | $99/year per account | Required to submit to App Store at all. |
| Enterprise Developer Program | $299/year | Internal distribution only, not for App Store. |
| Revenue share | 15% (Small Business Program) / 30% | SBP automatic under $1M annual; rises to 30% past the threshold. |
| Mac for builds | Required hardware | Apple Silicon for current Xcode. Hosted Mac CI (Bitrise, Codemagic, MacStadium, Xcode Cloud) starts at ~$30/month. |

## Gotchas oc-stack-forge will flag

- **No `npm run deploy` equivalent.** Submission is human + Apple review;
  pretending otherwise leads to broken deploy automations. `dispatchMobile`
  exists specifically to render a checklist instead of generating a script.
- **App Review feedback windows.** Apple emails the contact in App Store
  Connect → App Information; missing the reply window (usually 14 days)
  pulls the app from sale.
- **Expedited review abuse.** Available for genuine critical fixes;
  habitual requests get the account flagged and slows future reviews.
- **App Privacy / Privacy Manifest drift.** Adding a third-party SDK
  silently expands the data-collection surface — disclosures must stay in
  sync. Stack-forge's audit pass flags new SDK adds without a privacy
  delta in the same PR.
- **Auto-renewable subscriptions** add a separate App Store Connect
  configuration step (subscription groups, base prices, localized
  prices, introductory offers). Easy to forget on first submission.

## Status

`stable` — full coverage in v1.4. `kind: deploy-target`, so no
`skills.coverage.app-store.enabled` flag is emitted; visibility follows
the referring mobile pack. No deprecation path planned.
