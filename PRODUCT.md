# Product contract

## What this product is

This repository is an Android-native scroll-interoperability product for React Native.

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

## Current package identity

The current alpha package identifier remains:

```text
expo-material-toolbar
```

That identifier is a packaging compatibility surface, not the definition of the underlying architecture. Public npm naming and licensing are intentionally separate release decisions; this repository should not rename the package as part of unrelated runtime or architecture work.

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

Behavioral product target:

- Android only for native scroll interoperability and Material3 rendering;
- Expo development build / native build required; Expo Go does not contain this native module;
- Expo SDK 57 + React Native 0.86.2 fresh-consumer package/build/install/runtime is the current packaged alpha release gate;
- the neutral native architecture is also certified in this repository against the RN 0.87 bare host line.

The package currently keeps broad peer dependency ranges while it is private alpha. Those ranges are not a compatibility guarantee. Compatibility claims must come from recorded build/runtime gates, not from semver guesses.

## RN 0.86 compatibility

RN 0.86.x needs the package config plugin enabled with:

```json
[
  "expo-material-toolbar",
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
5. install/build/runtime in the fresh external consumer.

Frozen `*-pass` branches are evidence checkpoints and are never repointed.

## Non-goals

This product is not:

- a JS scroll-event interpolation library;
- a replacement scroll physics engine;
- a parent-owned scrolling container;
- a sampled `scrollY` synchronizer;
- a Material-only transport architecture.

Material3 is the first packaged consumer family. The transport itself remains neutral.
