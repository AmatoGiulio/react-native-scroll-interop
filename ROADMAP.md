# Roadmap

The goal is not "it works". The goal is that someone reading the code for five minutes cannot find
an obvious weak point — which is the bar for proposing the scroll-interop primitive upstream to
`react-native-screens`.

## Done — 2.1.0-alpha.1

Repo and packaging:

- [x] Real library layout with an example app, git history, and a build step
- [x] Bare React Native support (`MaterialToolbarPackage` + `ViewManager`s) alongside the Expo binding
- [x] Expo confined to its own Gradle source set; `src/main` has no `expo.modules` import
- [x] Example app shaped like a real app: 3 bottom tabs, FlashList grid, FlashList feed, plain `ScrollView`

P0 — the things a reviewer notices first:

- [x] Bidirectional `ScrollSourceController`; consumers no longer import `ReactScrollView`
- [x] `InteropBoundaryTest` enforces that mechanically instead of by convention
- [x] `ScrollPhase` in every frame → correct `NestedScrollSource` for drag vs fling
- [x] Real velocity forwarded to `onPostFling` instead of `Velocity.Zero`
- [x] Re-entrancy guard so a consumer-driven `scrollTo` cannot feed itself back
- [x] `setOnTouchListener` boundary observer removed entirely
- [x] Sessions driven by scroll change, so accessibility, programmatic, wheel and key scrolls work
- [x] Concurrent sessions per source instead of one global active source

## Known open bug — app bar height excludes the window inset

Reproduced on a Pixel 8 emulator, API 36, 1080x2400 @ 420dpi (density 2.625), on both variants:

```
topappbar rootInsets left=0 top=132 right=0     # 50dp status bar, correctly observed
reserve view=20 top=294 bottom=294              # 112dp — MediumTopAppBar content height only
topappbar begin mode=EnterAlways limit=-168 reserved=168   # 64dp — small bar, same story
```

The expanded medium bar should occupy 112dp + 50dp = 162dp = 425px, but the Compose host measures
exactly its content height, so the explicit `WindowInsets(top = rootInsets.top)` passed to Material
is not increasing the measured height. Visible effect: at full expansion the title is laid out ~6px
below the host's bounds and is clipped, so the title only appears once the bar has collapsed.

The scroll interop itself is unaffected and correct — collapse tracks the drag 1:1, clamps at the
limit, and `contentOffset` never drifts positive. This is purely the geometry of the embedded
Compose app bar under a React Native root, which is the same area alpha.21–alpha.24 kept revisiting.

Next step: check whether the inset is consumed before reaching the embedded `ComposeView`, and if
so apply it as explicit height rather than as a Material `windowInsets` parameter.

## Next — P1, correctness under the matrix

- [ ] Per-screen source ownership instead of "largest visible ScrollView on the surface"
- [ ] Calibrate velocity sign and magnitude against a real Compose app
- [ ] Nested vertical scrollers: pick the inner source, or declare and detect the conflict
- [ ] `maintainVisibleContentPosition` interaction with a reserved chrome band
- [ ] Rotation / cutout / edge-to-edge transitions while a session is live
- [ ] TalkBack pass now that programmatic scrolls produce sessions

## Then — P2, evidence

- [ ] Trace with the JS thread artificially blocked, proving the chrome still follows
- [ ] Allocation profile of the sampling loop (per-frame allocations are down but not zero)
- [ ] Screenshot/behaviour comparison against an equivalent native Compose screen
- [ ] CI matrix: RN 0.83.x, Expo and bare, FlashList 2.x, several Android versions

## Then — upstream

Pitch the primitive, not the product. `react-native-screens` already owns the screen, the header,
and its own scroll discovery work. What it does not have is a bidirectional native scroll-coordination
contract plus Material consumers written against it.

The proposal should be:

1. a video of `exitUntilCollapsed` and `exitAlways` driven by an unmodified FlashList, with the JS
   thread blocked;
2. `NativeScrollContract.kt` as a small diff — not the toolbar product;
3. an explicit list of which React Native internals the transport touches and what would need to
   become stable API.

Point 3 is what turns an interesting hack into a collaboration proposal.

## Product scope — deliberately not represented

### Selected navigation state

`FloatingToolbar` is not a tab container with selected-item APIs. Navigation state stays in Expo
Router / React Navigation. The bridge does not invent a selected pill.

### Arbitrary Compose objects

A JS prop cannot faithfully represent a Compose `Shape`, `FiniteAnimationSpec`,
`MutableInteractionSource`, or a custom composable lambda. The bridge keeps native defaults rather
than inventing lossy serialisations.

### Docked toolbar

No synthetic `kind="docked"` until there is a public Compose Material 3 API to map to.
