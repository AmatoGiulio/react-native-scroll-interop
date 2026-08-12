# React Native 0.87 nested-scroll experiment

This branch starts from the fully validated React Native 0.83 prototype and tests whether React Native 0.87's own AndroidX-backed `ReactNestedScrollView` can replace the custom 0.83 momentum patch.

## Upstream facts verified against React Native 0.87.0

- `MainReactPackage` selects `ReactNestedScrollViewManager` when `ReactNativeFeatureFlags.useNestedScrollViewAndroid()` is true and `ReactScrollViewManager` otherwise.
- the flag defaults to `false` in 0.87.0;
- `ReactNestedScrollView` is generated from `ReactScrollView` and extends AndroidX `NestedScrollView`;
- the flag is not enabled by the OSS Stable/Canary/Experimental release-level buckets (`ossReleaseStage: none`), so changing `reactNativeReleaseLevel` is not the experiment switch;
- RN's application entry point installs its feature-flag provider inside `loadReactNative()`, so an app override placed before that call would be replaced by the normal RN bootstrap.

## Host strategy

The example is moved to the current Expo 57 package line for Expo Modules infrastructure, while React Native is intentionally pinned to `0.87.0` instead of Expo 57's normal RN 0.86.2. This is an Android experiment, not a claim that Expo SDK 57 officially supports RN 0.87.

The example config plugin `plugins/with-rn087-nested-scroll-experiment.js` provides the ON variant. After the normal `loadReactNative()` call it uses RN's diagnostic `dangerouslyForceOverride` API with a provider that delegates every value to `ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android` and changes exactly:

```text
useNestedScrollViewAndroid = true
```

It also fails if `useNestedScrollViewAndroid` was already read before the override and logs the resulting value under `Rn087NestedScroll`.

This mechanism exists only to test the 0.87 implementation before proposing an upstream-supported opt-in. It is not production integration code.

### Reanimated intentionally removed from Stage 1

Expo 57 currently bundles Reanimated 4.5.1, whose published peer range stops at React Native 0.86. Reanimated main has begun the 4.6 development line with React Native 0.87 support, but that line also depends on a matching Worklets main build.

Stage 1 does not use Reanimated at all; the only example reference was an unused `ZoomIn` import. Reanimated and Worklets are therefore removed from this host rather than bypassing npm peer validation or adding unrelated nightly dependencies. They can be restored later if a screen actually needs them.

## Build variants

From `example/`:

```bash
rm -rf node_modules package-lock.json android
npm install
npm run verify:rn087
```

The verifier must report React Native and `@react-native/gradle-plugin` on the 0.87 line before either prebuild is allowed to run.

Flag OFF baseline:

```bash
npm run prebuild:rn087:off
npx expo run:android
```

Flag ON:

```bash
npm run prebuild:rn087:on
npx expo run:android
```

The prebuild is deliberately clean for each variant so the generated `MainApplication.kt` cannot retain the previous experiment state.

## Stage 1 — source contract only

Do not judge TopAppBar geometry in the flag-ON build yet. The validated 0.83 chrome bridge still names `ReactScrollView` directly and must be made type-neutral before that comparison is meaningful.

For each variant capture one short Gallery/Profile trace:

```bash
adb logcat -c
adb logcat -v time -s Rn087NestedScroll:I ExpoMaterialToolbar:D '*:S' | tee /tmp/rn087-off.log
```

or:

```bash
adb logcat -c
adb logcat -v time -s Rn087NestedScroll:I ExpoMaterialToolbar:D '*:S' | tee /tmp/rn087-on.log
```

Exercise a drag and at least two ordinary single-pointer flings, then analyze from the repository root:

```bash
npm run analyze:rn087-source -- /tmp/rn087-off.log --expect off
npm run analyze:rn087-source -- /tmp/rn087-on.log --expect on
```

Expected OFF evidence:

```text
source = com.facebook.react.views.scroll.ReactScrollView
no source-owned NON_TOUCH nested session
```

Expected ON evidence:

```text
Rn087NestedScroll: enabled=true ...
source = com.facebook.react.views.scroll.ReactNestedScrollView
TOUCH nested session present
NON_TOUCH nested session + pre-scroll frames present
```

The ON analyzer intentionally gates only the source contract at this stage. The existing chrome bridge cannot yet account the post phase because it refuses the new concrete source type.

## Test order

1. Build/run RN 0.87 with the flag OFF and no 0.83 RN source patch.
2. Confirm the OFF analyzer sees `ReactScrollView` and establishes the stock momentum baseline.
3. Build/run the same host with the flag ON.
4. Confirm the ON analyzer sees `ReactNestedScrollView` plus source-owned `NON_TOUCH` nested movement.
5. Only after Stage 1 passes, make the PoC source plumbing type-neutral and rerun the full chrome ledger.
6. Test pre/child/post accounting, top-edge Parent3 consumption semantics, fling interruption, repeated chrome collapse/expand, and FloatingToolbar settle.
7. Only if the existing RN 0.87 nested source fails should we patch React Native. Any patch must target the generated Kotlin `ReactNestedScrollView` path rather than reintroducing the 0.83 `computeScroll()` implementation.

## Known PoC adaptation before the chrome test

The validated 0.83 host currently discovers `android.widget.ScrollView` descendants and stores `ReactScrollView` as the concrete source type. That is intentionally incompatible with `ReactNestedScrollView : androidx.core.widget.NestedScrollView`.

Before judging the flag-ON chrome behavior, the PoC must make its source plumbing type-neutral:

- transaction authority remains Android's real nested-scroll `target`;
- discovery accepts RN's legacy `ReactScrollView` or the 0.87 `ReactNestedScrollView` without depending on the latter's internal Kotlin type;
- source state used by consumers is a `ViewGroup`, not a second movement abstraction;
- the 0.87 `setScrollAwayPaddingEnabledUnstable(top, bottom)` geometry primitive is isolated behind the experimental visual bridge.

This adaptation changes no scroll physics and must not add sampling, a proxy scroller, or parent-driven `scrollBy`.
