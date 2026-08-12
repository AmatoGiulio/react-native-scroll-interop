# RN 0.87 bare nested-scroll probe

This Android-only probe isolates React Native 0.87's own ScrollView transaction from Expo, Material3, react-native-screens, Reanimated, FlashList, and the RN 0.83 momentum patch.

The native parent implements `NestedScrollingParent3`, accepts vertical nested scrolling, logs the transaction, and normally consumes zero. React Native remains the only owner of scroll physics.

## Setup

```bash
cd rn087-bare-probe
rm -rf node_modules package-lock.json
npm install
```

`postinstall` copies the Gradle 9.4.1 wrapper directly from `@react-native/gradle-plugin@0.87.0`, so no wrapper binary is stored in this repository.

Start Metro in terminal A:

```bash
npm start
```

The Android runner clears logcat immediately before launching the app. Do not clear logcat again after launch: the analyzer uses the `Rn087NestedScroll enabled=...` bootstrap line to verify the selected feature-flag variant.

## OFF baseline

Terminal B:

```bash
npm run android:off
```

Terminal C, without another `adb logcat -c`:

```bash
adb logcat -v time -s Rn087NestedScroll:I '*:S' | tee /tmp/rn087-bare-off.log
```

Exercise a drag, a fling, a reverse drag, and another fling. Stop logcat, then run from this directory:

```bash
npm run analyze:off
```

Expected OFF evidence:

```text
explicit experiment flag  false
ReactScrollView            present
TOUCH                      present
NON_TOUCH                  absent
OFF source-class gate      PASS
```

## ON stock RN 0.87 experiment

```bash
npm run android:on
```

Capture the same gesture sequence, again without clearing logcat after launch:

```bash
adb logcat -v time -s Rn087NestedScroll:I '*:S' | tee /tmp/rn087-bare-on.log
```

Then:

```bash
npm run analyze:on
```

The first bare run on RN 0.87.0 showed that the feature flag works and selects `ReactNestedScrollView`, but ordinary flings do not start `TYPE_NON_TOUCH`: the stock ON source gate therefore fails on momentum.

RN 0.87's `ReactNestedScrollView.fling()` directly calls the reflected AndroidX `mScroller.fling(...)` when that field is available. This bypasses `NestedScrollView.fling()`, whose `runAnimatedScroll(true)` starts the `TYPE_NON_TOUCH` nested-scroll session used by inherited `computeScroll()` for pre/post dispatch.

## ON diagnostic fling-session shim

This variant does not alter scroll physics. It keeps RN 0.87's real `ReactNestedScrollView` and its real `OverScroller`, but when the parent receives the child's existing nested-fling callback it calls `ViewCompat.startNestedScroll(target, VERTICAL, TYPE_NON_TOUCH)` on that same target. It consumes no pixels and never calls `scrollBy`/`scrollTo`.

Run:

```bash
npm run android:on-shim
```

Capture:

```bash
adb logcat -v time -s Rn087NestedScroll:I '*:S' | tee /tmp/rn087-bare-on-shim.log
```

Exercise the same drag/fling sequence and then:

```bash
npm run analyze:on-shim
```

If this produces `NON_TOUCH` start/pre/post frames and the ON analyzer passes, it is causal evidence that RN 0.87's missing piece is the non-touch session start around its direct `OverScroller` fling, not missing AndroidX nested-scroll physics.

The flag is selected with the Gradle property `rnNestedScrollAndroid`. The ON builds call RN 0.87's diagnostic `dangerouslyForceOverride` only after the standard `loadReactNative(this)` feature-provider bootstrap and fail if `useNestedScrollViewAndroid` had already been accessed.

There is deliberately no JS `onScroll`, proxy scroller, sampled delta reconstruction, parent-driven movement, or chrome behavior in this probe.
