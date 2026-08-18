# Product contract

## What this product is

`react-native-scroll-interop` is an Android-native scroll-interoperability product for React Native.

It lets native Android UI consume or observe the real synchronous nested-scroll transaction emitted by a React Native vertical scroll source while React Native remains the sole owner of touch handling, source position and fling physics.

The product invariant is:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native UI consumers
```

The current packaged alpha includes Material3 chrome as the first production consumer set:

- `MaterialTopAppBar`
- `MaterialToolbar` / Material3 FloatingToolbar

The JavaScript integration point is `NativeScrollHost`.

## Package identity

Public npm package:

```text
react-native-scroll-interop
```

Initial public release line:

```text
0.1.0-alpha.x
```

Alpha releases use the npm `next` dist-tag. The project is licensed under MIT.

The historical Android/Expo implementation namespace remains `expo.modules.materialtoolbar` and native registration names such as `ExpoNestedScrollHostView` remain unchanged. They are implementation compatibility surfaces, not the public npm identity.

## Public JavaScript API

### `NativeScrollHost`

Wraps a React Native vertical scroll source on Android and provides the native nested-scrolling parent through which native UI receives the source's real transaction.

It does not:

- install a JS `onScroll` transport;
- own a second `ScrollView` or `OverScroller`;
- call `scrollBy` / `scrollTo` to execute source movement;
- estimate velocity or reconstruct momentum.

On non-Android platforms it is a normal React Native `View` fallback so importing the package does not require an Android-only native view manager.

### `MaterialTopAppBar`

Native Material3 TopAppBar consumer.

Supported alpha behaviors:

- variants: `small`, `medium`, `large`;
- scroll behaviors: `none`, `enterAlways`, `exitUntilCollapsed`;
- native theme mode and Android dynamic color.

The app bar participates in PRE and POST nested-scroll accounting and may consume real transaction distance.

### `MaterialToolbar`

Native Material3 FloatingToolbar surface with compound React descriptors:

- `Root`
- `Content`
- `LeadingContent`
- `TrailingContent`
- `IconButton`
- `TextButton`
- `Icon`
- `Text`
- `Fab`

Its scroll behavior is observation-only in Android transaction accounting: it receives real child-consumed POST distance and consumes zero list distance.

## Current platform/support contract

Package-level alpha target:

- Android only for native scroll interoperability and Material3 rendering;
- Expo development build / native build required; Expo Go does not contain this native module;
- Expo SDK 57;
- React Native 0.86.x, with the version-scoped AndroidX compatibility plugin enabled;
- Expo SDK 57 + React Native 0.86.2 fresh-consumer package/build/install/runtime is the current release gate.

The neutral native architecture is additionally certified in this repository against the RN 0.87 bare host line. That evidence does not yet widen the public package peer range; package compatibility is promoted only after an equivalent packaged consumer gate.

## RN 0.86 compatibility

RN 0.86.x needs the package config plugin enabled with:

```json
[
  "react-native-scroll-interop",
  {
    "android": {
      "rn086AndroidXScroll": true
    }
  }
]
```

The plugin is version-scoped and fail-closed. It preserves React Native ownership of fling initiation and physics while routing the ordinary non-paging `ReactNestedScrollView` fling through AndroidX's native NON_TOUCH nested-scroll lifecycle.

The plugin is not the transport architecture and does not implement Material behavior.

## Native internal layering

The implementation is deliberately split into four layers:

```text
com.reactnativescroll.interop.core
com.reactnativescroll.interop.reactnative
com.reactnativescroll.interop.material3
expo.modules.materialtoolbar
```

Only the JavaScript product surface and documented Expo plugin configuration are public package contracts. Kotlin classes remain implementation detail unless a future Android-native API is explicitly promoted.

## Release discipline

A product release must preserve these gates:

1. native scroll invariants;
2. Material3 adapter invariants;
3. RN 0.86 config-plugin invariant;
4. npm package-surface invariant;
5. install/build/runtime in the fresh external consumer using the exact package name/version candidate.

Frozen `*-pass` branches are evidence checkpoints and are never repointed.

Release operations are documented in [`RELEASE.md`](RELEASE.md).

## Non-goals

This product is not:

- a JS scroll-event interpolation library;
- a replacement scroll physics engine;
- a parent-owned scrolling container;
- a sampled `scrollY` synchronizer;
- a Material-only transport architecture.

Material3 is the first packaged consumer family. The transport itself remains neutral.
