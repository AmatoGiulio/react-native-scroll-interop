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

The initial packaged consumer family is Material3:

- `MaterialTopAppBar`
- `MaterialToolbar` / Material3 FloatingToolbar

The JavaScript scroll integration point is `NativeScrollHost`.

## Navigation-first product model

Public usage is navigation-first. Native chrome is declared at the navigation layer instead of repeated inside each screen component.

```text
navigation layout
├── Stack
│   ├── route A -> MaterialTopAppBar
│   └── route B -> MaterialTopAppBar
└── persistent MaterialToolbar

route content
└── NativeScrollHost
    └── React Native vertical scroll source
```

The responsibilities are intentionally different:

- `MaterialTopAppBar` is route/header chrome. It is rendered through the host navigator's custom-header API.
- `MaterialToolbar` is persistent layout chrome. It is normally mounted once around a navigation scope.
- `NativeScrollHost` stays with the actual scrolling screen/source so the Android nested-scroll ancestor relationship remains real.

Navigation libraries do not transport scroll position, velocity, momentum or frame updates. They only own routing/header placement. Android's actual nested-scroll target remains transaction authority.

### Expo Router

The initial Expo Router integration target is SDK 57:

- declare `MaterialTopAppBar` directly under `Stack.Screen` with `Stack.Header asChild`;
- use a transparent Stack header so the Material app bar remains overlay chrome and native scroll-away geometry remains owned by the interop layer;
- declare one persistent `MaterialToolbar.Root` in the route layout;
- keep screen files free of repeated TopAppBar/FloatingToolbar declarations.

### React Navigation

`MaterialTopAppBar` does not import React Navigation. React Navigation's native-stack `header` callback supplies navigation/back ownership and renders the same component. `headerTransparent: true` preserves the overlay model. A persistent `MaterialToolbar.Root` can live around the navigator.

React Navigation's `screenLayout` may be used by applications that want to centralize per-screen wrappers such as `NativeScrollHost`; this is optional and does not become part of scroll physics.

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

Native Material3 TopAppBar consumer and navigator-header surface.

Supported initial behaviors:

- variants: `small`, `medium`, `large`;
- scroll behaviors: `none`, `enterAlways`, `exitUntilCollapsed`;
- navigation icon: `none`, `back`;
- native Material3 back `IconButton` with host-provided `onNavigationPress` callback;
- native theme mode and Android dynamic color.

The package does not import a navigation library. The navigator remains responsible for deciding whether a back action exists and for executing navigation when the native Material button emits `onNavigationPress`.

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

`Root` is an absolute overlay by default, allowing one toolbar to persist at the navigation-layout level.

Its scroll behavior is observation-only in Android transaction accounting: it receives real child-consumed POST distance and consumes zero list distance.

## Current platform/support contract

First-public-alpha target:

- Android only for native scroll interoperability and Material3 rendering;
- Expo development build / native build required; Expo Go does not contain this native module;
- Expo SDK 57;
- Expo Router SDK 57 navigation-first integration;
- React Navigation native-stack navigation-first integration;
- React Native 0.86.x, with the version-scoped AndroidX compatibility plugin enabled.

The first npm publication is blocked until both Expo Router and React Navigation navigation-first consumer gates pass on the exact release candidate.

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

A first public alpha must preserve these gates:

1. native scroll invariants;
2. Material3 adapter invariants;
3. navigation-surface static invariants;
4. RN 0.86 config-plugin invariant;
5. npm package-surface invariant;
6. exact-tarball Expo Router navigation-first build/install/runtime gate;
7. exact-tarball React Navigation native-stack build/install/runtime gate.

Navigation runtime gates must cover at least:

- TopAppBar declared by the navigator, not the screen;
- FloatingToolbar declared once by the layout;
- Home/details navigation;
- native Material back button;
- ordinary scroll and NON_TOUCH fling on both screens;
- return to the previous screen and a new scroll transaction;
- persistent FloatingToolbar still observing the active source;
- no duplicate/ambiguous native chrome binding.

Frozen `*-pass` branches are evidence checkpoints and are never repointed.

Release operations are documented in [`RELEASE.md`](RELEASE.md).

## Non-goals

This product is not:

- a router or navigator replacement;
- a JS scroll-event interpolation library;
- a replacement scroll physics engine;
- a parent-owned scrolling container;
- a sampled `scrollY` synchronizer;
- a Material-only transport architecture.

Material3 is the first packaged consumer family. The transport itself remains neutral.
