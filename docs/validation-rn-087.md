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
packages/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlagsDefaults.kt
packages/react-native/scripts/featureflags/ReactNativeFeatureFlags.config.js
```

## Feature-flag startup constraint

`ReactNativeFeatureFlags.override(provider)` is public, but React Native documents that it must be called before the runtime is initialized.

The default Android new-architecture entry point also calls `ReactNativeFeatureFlags.override(...)` itself according to `DefaultNewArchitectureEntryPoint.releaseLevel`. The generated `ReactNativeApplicationEntryPoint.loadReactNative()` invokes that default entry point.

So this is **not** a safe experiment setup:

```text
ReactNativeFeatureFlags.override(customProvider)
loadReactNative(this) // default entry point tries to override again
```

Nor should the experiment silently use `dangerouslyForceOverride` after runtime initialization without first proving no relevant flags were already consumed.

The opt-in mechanism must therefore be explicit and isolated. Candidate mechanisms are:

1. a tiny experiment-only patch that changes only the 0.87 OSS stable feature-flag provider's value for `useNestedScrollViewAndroid`, with no ScrollView algorithm changes; or
2. a custom startup path that supplies a complete provider before the React Native runtime is initialized, if a clean supported hook is identified.

The first mechanism is acceptable as a **flag-selection patch** for an experiment, but must never be confused with the old 0.83 source-physics patch.

## Expo compatibility constraint

The current Expo SDK 57 documentation targets React Native 0.86. The current `expo/expo` main bare template inspected on 2026-08-12 also still contains:

```json
{
  "expo": "~57.0.9",
  "react": "19.2.3",
  "react-native": "0.86.2"
}
```

Therefore this branch must not blindly run `expo install --fix` and assume it creates a supported RN 0.87 host. Expo's normal dependency alignment would target 0.86 at this point.

The 0.87 source experiment should either:

- wait for / use an Expo prerelease that explicitly targets RN 0.87 once available; or
- use a deliberately pinned experimental host and treat any Expo compatibility issue separately from the nested-scroll result.

## Required experiment matrix

Do not carry `docs/upstream/react-scroll-view-momentum-nested-scroll.patch` into the RN 0.87 source test.

### A — flag OFF

```text
React Native 0.87.0
useNestedScrollViewAndroid = false
no 0.83 momentum patch
```

Run the existing host against the ordinary `ReactScrollView` path and record drag + fling behavior. This is the control.

### B — flag ON

```text
React Native 0.87.0
useNestedScrollViewAndroid = true
no ScrollView algorithm patch
```

Verify the actual native source class is the AndroidX-backed path, then run:

- slow drag;
- collapse-limit handoff;
- reverse direction;
- top-edge expansion;
- short and hard fling;
- `TYPE_NON_TOUCH` transaction delivery;
- new touch interrupting momentum;
- TopAppBar + FloatingToolbar;
- RN ScrollView + FlashList;
- transaction ledger conservation.

## Decision gate

If flag ON gives the host a complete touch + momentum nested transaction:

```text
DO NOT upstream the old 0.83 computeScroll/OverScroller patch.
```

The React Native contribution should instead focus on whatever is required to make the existing `ReactNestedScrollView` path usable, correct and testable upstream.

If flag ON fails, isolate the smallest defect in the generated Kotlin/AndroidX path and patch that defect only.

The screen/parent architecture remains unchanged in either case:

```text
one source physics
one real synchronous nested transaction
screen/native ancestor consumes or observes that transaction
no parent-owned scroller
no sampled scrollY reconstruction
```
