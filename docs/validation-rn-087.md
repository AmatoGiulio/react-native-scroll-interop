# React Native 0.87 nested-scroll experiment

This branch starts from the fully validated React Native 0.83 source-owned baseline. The purpose of the 0.87 experiment is to test React Native's existing AndroidX-backed vertical ScrollView path before carrying forward any custom source momentum implementation.

## Verified upstream state — 2026-08-12

React Native `v0.87.0` is a stable release published on 2026-08-11.

In the `v0.87.0` tag:

- `MainReactPackage` registers `ReactNestedScrollViewManager` instead of `ReactScrollViewManager` when `ReactNativeFeatureFlags.useNestedScrollViewAndroid()` is true;
- `ReactNestedScrollView` extends `androidx.core.widget.NestedScrollView`;
- `ReactNativeFeatureFlagsDefaults.useNestedScrollViewAndroid()` returns `false`;
- the feature-flag definition describes the flag as making ReactScrollView extend NestedScrollView for improved Android nested scrolling support;
- its `ossReleaseStage` is `none`, not `canary` or `experimental`.

Therefore changing React Native's release level alone does **not** opt into this ScrollView implementation.

Relevant upstream paths at tag `v0.87.0`:

```text
packages/react-native/ReactAndroid/src/main/java/com/facebook/react/shell/MainReactPackage.kt
packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/scroll/ReactNestedScrollView.kt
packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/scroll/generate-nested-scroll-view.js
packages/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlagsDefaults.kt
packages/react-native/scripts/featureflags/ReactNativeFeatureFlags.config.js
```

## Feature-flag startup constraint

`ReactNativeFeatureFlags.override(provider)` is public, but React Native documents that it must be called before the runtime is initialized.

The default Android new-architecture entry point also calls `ReactNativeFeatureFlags.override(...)` itself according to `DefaultNewArchitectureEntryPoint.releaseLevel`. The generated `ReactNativeApplicationEntryPoint.loadReactNative()` invokes that default entry point.

The bare probe therefore uses `dangerouslyForceOverride` only after the normal bootstrap and fails if `useNestedScrollViewAndroid` was already accessed. The runtime class gate then verifies that the requested implementation was actually selected.

## Expo compatibility constraint

Expo SDK 57 is not a clean RN 0.87 host. The attempted pinned host exposed independent Gradle/Kotlin/AGP incompatibilities before any nested-scroll code ran. The RN 0.87 source experiment was therefore moved to `rn087-bare-probe/`, which uses the RN 0.87 toolchain directly.

This keeps Expo host compatibility separate from the source transaction result.

## Runtime result

The bare probe established the following matrix on 2026-08-12.

### A — flag OFF

```text
Native source classes
ReactScrollView  502

starts TOUCH / NON_TOUCH   47 / 0
stops  TOUCH / NON_TOUCH   47 / 0
pre    TOUCH / NON_TOUCH   175 / 0
pre-fling / fling          29 / 29

OFF source-class gate: PASS
```

This is the expected control: legacy ReactScrollView reports touch nested scrolling but not source-owned momentum.

### B — flag ON, stock RN 0.87.0

```text
Native source classes
ReactNestedScrollView  208

starts TOUCH / NON_TOUCH   9 / 0
stops  TOUCH / NON_TOUCH   9 / 0
pre    TOUCH / NON_TOUCH   89 / 0
pre-fling / fling          6 / 6

ON source-class gate:     PASS
ON NON_TOUCH source gate: FAIL
```

The feature flag works: the actual native source changes to `ReactNestedScrollView`. The stock implementation still fails the momentum contract.

### C — causal parent shim

A diagnostic-only parent shim called `startNestedScroll(VERTICAL, TYPE_NON_TOUCH)` on the *real transaction target* when the target emitted its already-existing fling callback. The parent still consumed zero, never moved the child and owned no scroller.

Result:

```text
ReactNestedScrollView  500
starts TOUCH / NON_TOUCH   5 / 2
stops  TOUCH / NON_TOUCH   5 / 2
pre    TOUCH / NON_TOUCH   188 / 52
pre-fling / fling          2 / 2

ON bootstrap gate:        PASS
ON source-class gate:     PASS
ON NON_TOUCH source gate: PASS
```

This proved that AndroidX's frame loop was already capable of producing the desired momentum transaction once its NON_TOUCH session existed.

### D — RN 0.87 built from source, parent shim removed

The source probe then compiled ReactAndroid from `node_modules/react-native` and changed the ordinary `ReactNestedScrollView.fling()` path to delegate to AndroidX `NestedScrollView.fling()` instead of directly invoking the reflected `OverScroller`.

Result:

```text
ReactNestedScrollView  826
starts TOUCH / NON_TOUCH   42 / 21
stops  TOUCH / NON_TOUCH   42 / 21
pre    TOUCH / NON_TOUCH   115 / 214
pre-fling / fling          21 / 21
source patch flings        21

ON bootstrap gate:            PASS
ON source-class gate:         PASS
ON NON_TOUCH source gate:     PASS
ON source-patch runtime gate: PASS
```

This is the decisive source result: RN remains the owner of the fling, the parent owns no physics, and the AndroidX source emits the real frame-by-frame NON_TOUCH transaction itself.

### E — source patch + Material3 TopAppBar end to end

The next bare-probe gate attached a real Material3 `LargeTopAppBar` with `exitUntilCollapsedScrollBehavior` to the same Android `NestedScrollingParent3` transaction, while using RN 0.87's unstable scroll-away padding primitive for geometry. The parent still owned no scroller and never moved the React child directly.

Observed result:

```text
Source
bootstrap true              true
ReactNestedScrollView lines 515
source patch flings         7

Nested sessions
starts TOUCH / NON_TOUCH    12 / 7
stops  TOUCH / NON_TOUCH    12 / 7

Material3 chrome
scroll-away success         1
movement TOUCH / NON_TOUCH  143 / 14
settle start / end          10 / 10
```

The transaction ledger initially reported 183 post-complete frames, zero broken frames and 66 pre-only frames. Those pre-only frames were then classified against AndroidX's actual dispatch contract:

```text
post-complete frames        183
full-pre TOUCH frames       62
full-pre NON_TOUCH frames   4
complete frames             249
broken complete frames      0
unexpected orphan pre       0
```

A fully pre-consumed frame legitimately has no parent post callback. On the touch path, `NestedScrollView.scrollBy(...)` still calls `dispatchNestedScroll(...)`, but after full pre-consumption every child/post delta is zero; `NestedScrollingChildHelper` deliberately suppresses that all-zero dispatch ("No motion, no dispatch"). The fling path can likewise finish a frame entirely in pre-scroll.

Therefore the end-to-end TopAppBar gate is closed: the same RN-owned TOUCH/NON_TOUCH transaction drives Material3 pre/post consumption, scroll-away geometry and terminal settle, with every observable frame conserving distance and no second scroll physics.

### F — one transaction, two real Material consumers

The next gate added a real Material3 FloatingToolbar scroll behavior to the same Parent3 transaction. Unlike the TopAppBar, the FloatingToolbar consumes no distance: it observes only the child-consumed post-scroll movement and therefore cannot change the transaction ledger.

Observed result:

```text
Source
bootstrap true              true
ReactNestedScrollView lines 1875
source patch flings         34

Nested sessions
starts TOUCH / NON_TOUCH    68 / 34
stops  TOUCH / NON_TOUCH    68 / 34

Material3 TopAppBar
movement TOUCH / NON_TOUCH  120 / 16
settle start / end          42 / 42

Transaction ledger
post-complete frames        630
full-pre TOUCH frames        76
full-pre NON_TOUCH frames     0
complete frames             706
broken complete frames        0
unexpected orphan pre         0

Material3 FloatingToolbar
behavior binds                1
geometry samples              1
child movement post T/NT    261 / 314
observed posts T/NT         261 / 314
visual movement T/NT        109 / 2
settle start / end           42 / 42
```

Every gate passed. Most importantly, FloatingToolbar coverage was exact: 261/261 non-zero child post frames for TOUCH and 314/314 for NON_TOUCH. The TopAppBar ledger remained 706 complete / 0 broken / 0 unexpected.

This closes the transport architecture proof:

```text
one RN-owned physics
one real synchronous TOUCH/NON_TOUCH transaction
TopAppBar consumes pre/post
FloatingToolbar observes child-consumed post
zero second-scroll reconstruction
```

## Isolated defect

`ReactNestedScrollView.kt` is generated from `ReactScrollView.kt`. In RN 0.87.0 the generated class inherits AndroidX `NestedScrollView`, but its copied `fling()` override still takes the legacy path:

```text
correct velocity
-> reflected mScroller.fling(...)
-> postInvalidateOnAnimation()
```

That bypasses AndroidX `NestedScrollView.fling()`, whose animated-scroll setup starts `TYPE_NON_TOUCH`, initializes the scroller baseline, and lets `computeScroll()` perform nested pre/post dispatch until the fling stops.

So the 0.87 defect is much smaller than the 0.83 limitation: the AndroidX transaction machinery already exists, but the generated RN override bypasses its fling entry point.

## Upstream direction

Do **not** carry `docs/upstream/react-scroll-view-momentum-nested-scroll.patch` forward as the RN 0.87 solution.

The upstream shape should instead adjust the nested variant generation so ordinary `ReactNestedScrollView` flings enter AndroidX's own fling path while preserving RN-specific paging/snap behavior. Because `ReactNestedScrollView.kt` is generated, the canonical fix belongs in `generate-nested-scroll-view.js` (plus regenerated output), not as a hand edit to the generated Kotlin file.

Before proposing that change upstream, validate edge/overfling, interruption, paging/snap and momentum event behavior because delegating to `NestedScrollView.fling()` intentionally uses AndroidX's own scroller setup rather than the legacy copied parameters.

## Parent-side consequence

The parent/screen architecture does not change:

```text
one source physics
one real synchronous nested transaction
screen/native ancestor consumes or observes that transaction
no parent-owned scroller
no sampled scrollY reconstruction
```

The module adapter must accept both RN source classes without directly importing the Kotlin-internal RN 0.87 class. The transaction `target` remains authoritative; runtime class inspection is only a compatibility boundary for source preparation/binding, and reflection is allowed only for RN's unstable scroll-away geometry primitive.
