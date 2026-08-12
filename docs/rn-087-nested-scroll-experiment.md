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

## Build variants

From `example/`:

```bash
npm install
```

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

For the ON build, verify bootstrap first:

```bash
adb logcat -c
adb logcat -s Rn087NestedScroll:I ExpoMaterialToolbar:D '*:S'
```

Expected bootstrap evidence:

```text
Rn087NestedScroll: enabled=true ...
```

and nested-scroll traces should identify the source class as:

```text
com.facebook.react.views.scroll.ReactNestedScrollView
```

The OFF variant should continue to identify:

```text
com.facebook.react.views.scroll.ReactScrollView
```

## Test order

1. Build/run RN 0.87 with the flag OFF and no 0.83 RN source patch.
2. Confirm touch behavior and establish that stock `ReactScrollView` still lacks the momentum transaction required by this PoC.
3. Build/run the same host with the flag ON.
4. Confirm the actual native source is `ReactNestedScrollView`.
5. Test TOUCH and NON_TOUCH nested sessions, pre/child/post accounting, top-edge post-consumption semantics, fling interruption, and repeated chrome collapse/expand.
6. Only if the existing RN 0.87 path fails should we patch React Native, and any patch must target the generated Kotlin `ReactNestedScrollView` source rather than reintroducing the 0.83 `computeScroll()` implementation.

## Known PoC adaptation before the chrome test

The validated 0.83 host currently discovers `android.widget.ScrollView` descendants and stores `ReactScrollView` as the concrete source type. That is intentionally incompatible with `ReactNestedScrollView : androidx.core.widget.NestedScrollView`.

Before judging the flag-ON chrome behavior, the PoC must make its source plumbing type-neutral:

- transaction authority remains Android's real nested-scroll `target`;
- discovery accepts RN's legacy `ReactScrollView` or the 0.87 `ReactNestedScrollView` without depending on the latter's internal Kotlin type;
- source state used by consumers is a `ViewGroup`, not a second movement abstraction;
- the 0.87 `setScrollAwayPaddingEnabledUnstable(top, bottom)` geometry primitive is isolated behind the experimental visual bridge.

This adaptation changes no scroll physics and must not add sampling, a proxy scroller, or parent-driven `scrollBy`.
