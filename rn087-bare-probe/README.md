# RN 0.87 bare nested-scroll probe

This Android-only probe isolates React Native 0.87's own ScrollView transaction from Expo, Material3, react-native-screens, Reanimated, FlashList, and the RN 0.83 momentum patch.

The native parent implements `NestedScrollingParent3`, accepts vertical nested scrolling, logs the transaction, and consumes zero. React Native remains the only owner of scroll physics.

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

## OFF baseline

Terminal B:

```bash
npm run android:off
```

Terminal C:

```bash
adb logcat -c
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

## ON experiment

```bash
npm run android:on
```

Capture the same gesture sequence:

```bash
adb logcat -c
adb logcat -v time -s Rn087NestedScroll:I '*:S' | tee /tmp/rn087-bare-on.log
```

Then:

```bash
npm run analyze:on
```

Expected ON evidence:

```text
explicit experiment flag  true
ReactNestedScrollView      present
TOUCH                      present
NON_TOUCH start            > 0
NON_TOUCH pre              > 0
ON bootstrap gate          PASS
ON source-class gate       PASS
ON NON_TOUCH source gate   PASS
```

The flag is selected with the Gradle property `rnNestedScrollAndroid`. The ON build calls RN 0.87's diagnostic `dangerouslyForceOverride` only after the standard `loadReactNative(this)` feature-provider bootstrap and fails if `useNestedScrollViewAndroid` had already been accessed.

There is deliberately no JS `onScroll`, proxy scroller, sampled delta reconstruction, parent-driven `scrollBy`, or chrome behavior in this probe.
