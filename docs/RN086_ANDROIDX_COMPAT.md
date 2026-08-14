# Expo / React Native 0.86 AndroidX scroll compatibility

This compatibility path is for Expo projects on React Native 0.86.x that need the vertical AndroidX `ReactNestedScrollView` source and true frame-by-frame `TYPE_NON_TOUCH` nested scrolling during fling.

## Enable

Add the package config plugin to the Expo config:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-material-toolbar",
        {
          "android": {
            "rn086AndroidXScroll": true
          }
        }
      ]
    ]
  }
}
```

Then use the normal Expo workflow:

```bash
npx expo prebuild -p android --clean
npx expo run:android
```

No separate patch runner is required.

## What the plugin changes

Android only:

1. Builds React Native from source by adding the same ReactAndroid/Hermes dependency substitutions used by Expo's `buildReactNativeFromSource` path.
2. Selects the existing RN 0.86 `ReactNestedScrollViewManager` for the vertical `RCTScrollView` manager.
3. Changes the non-paging `ReactNestedScrollView.fling()` path from direct `mScroller.fling(...)` dispatch to `super.fling(correctedVelocityY)`, so AndroidX owns the typed `TYPE_NON_TOUCH` nested-scroll transaction while React Native still owns fling physics.

The library transport, dispatcher, ledger, TopAppBar consumer, FloatingToolbar observer and React child scroll position are not modified by this compatibility plugin.

## Safety contract

- Only `react-native` 0.86.x is accepted.
- The patch is idempotent.
- The plugin validates the expected RN source shape before changing either source file.
- An unknown source shape fails the prebuild instead of applying a best-effort patch.
- Existing source-build configuration (for example from `expo-build-properties`) is detected and not duplicated.
- Other React Native versions must disable `android.rn086AndroidXScroll`.

## Validated matrix

Validated on Expo SDK 57 / React Native 0.86.2 with:

- ScrollView
- FlatList
- SectionList
- FlashList

The validated behavior includes real `TYPE_NON_TOUCH`, continuous child-to-TopAppBar momentum handoff and balanced nested-scroll conservation accounting.

## Current scope

The validated matrix is for standard non-paging vertical scrolling. When React Native enters its `pagingEnabled` / snap-specific `flingAndSnap` path, this compatibility plugin intentionally preserves that RN path and does not claim the same momentum handoff guarantee until it is tested separately.

Building React Native from source makes Android clean builds slower than the default precompiled React Native artifact path.
