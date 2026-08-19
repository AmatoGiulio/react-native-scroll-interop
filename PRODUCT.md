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

The preferred navigation integration point is the native `react-native-screens` screen. `NativeScrollHost` remains the standalone/fallback integration point when no supported native screen owns the nested-scroll parent role.

## Navigation-first product model

Public usage is navigation-first. Native chrome is declared at the navigation layer instead of repeated inside each screen component.

```text
navigation layout
├── Stack
│   ├── route A -> MaterialTopAppBar
│   └── route B -> MaterialTopAppBar
└── persistent MaterialToolbar

native screen
└── plain React Native vertical scroll source
    └── ScrollView / FlatList / SectionList / compatible source
```

On the certified Android path:

```text
Expo Router / React Navigation
          ↓
react-native-screens Screen
          ↓
ReactNativeNestedScrollParentController
          ↓
real React Native nested-scroll target
```

Responsibilities are intentionally separated:

- `MaterialTopAppBar` is route/header chrome;
- `MaterialToolbar` is persistent layout chrome;
- `react-native-screens` owns native route/content identity;
- `ReactNativeNestedScrollParentController` owns the real Android nested-scroll parent lifecycle and PRE/POST dispatch;
- the React Native target remains source/physics authority;
- `NativeScrollHost` is a thin source-discovery adapter for standalone/fallback usage.

Navigation libraries do not transport scroll position, velocity, momentum or frame updates.

### Expo Router

The SDK 57 integration surface is:

```tsx
import { Stack } from 'react-native-scroll-interop/router';
```

The wrapper preserves Expo Router's `Stack` model and static APIs. Standard native-stack options remain primary:

- `title` / string `headerTitle` map to the Material title on Android;
- `headerLargeTitle` / `headerLargeTitleEnabled` map to a large Material TopAppBar;
- native-stack back state drives the Material back button and existing `navigation.goBack()`;
- Material-only configuration lives under `material3.topAppBar`;
- `material3.topAppBar: false` opts back into the platform-native header;
- unsupported custom header options fall back to the platform-native header instead of being silently dropped;
- iOS/web pass through existing Expo Router native-stack behavior after stripping the Material-only namespace.

Normal route files contain plain React Native scroll content with no `NativeScrollHost` wrapper.

### React Navigation

`MaterialTopAppBar` itself remains navigation-library agnostic. React Navigation native stack can supply it through its standard custom `header` option while the same screen-owned Android nested-scroll controller provides transport on the supported `react-native-screens` line.

There is no proprietary navigator and no parallel navigation state. React Navigation remains responsible for route/back ownership.

The exact-tarball React Navigation runtime gate is still required before first publication.

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

The historical Android/Expo implementation namespace `expo.modules.materialtoolbar` and native registration names are implementation compatibility surfaces, not the public npm identity.

## Public JavaScript API

### `react-native-scroll-interop/router`

Optional Expo Router SDK 57 adapter.

It imports Expo Router only when the `/router` subpath is used. `expo-router` is therefore an optional peer for the package root.

The adapter does not replace routing. It translates supported Android header semantics to `MaterialTopAppBar` and preserves Expo Router / React Navigation / `react-native-screens` ownership.

### `NativeScrollHost`

Standalone/fallback Android nested-scroll parent around a React Native vertical source.

It delegates lifecycle/transaction handling to the same reusable `ReactNativeNestedScrollParentController` used by native screen integration.

It does not:

- install a JS `onScroll` transport;
- own a second `ScrollView` or `OverScroller`;
- call `scrollBy` / `scrollTo` to execute source movement;
- estimate velocity or reconstruct momentum.

On non-Android platforms it is a normal React Native `View` fallback.

### `MaterialTopAppBar`

Native Material3 TopAppBar consumer and navigator-header surface.

Supported initial behaviors:

- variants: `small`, `medium`, `large`;
- scroll behaviors: `none`, `enterAlways`, `exitUntilCollapsed`;
- placement: `overlay`, `header`;
- navigation icon: `none`, `back`;
- native Material3 back `IconButton` with host-provided callback;
- native theme mode and Android dynamic color.

`placement="overlay"` remains the standalone default. `placement="header"` owns the expanded Material3 height plus top safe inset for custom navigator-header usage.

The base component does not import a navigation library. The optional `/router` adapter is the Expo Router-specific surface.

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

`Root` is an absolute overlay by default, allowing one toolbar to persist at navigation-layout scope.

Its scroll behavior is observation-only in Android transaction accounting: it receives real child-consumed POST distance and consumes zero list distance.

## Current platform/support contract

First-public-alpha target:

- Android only for native scroll interoperability and Material3 rendering;
- Expo development build / native build required; Expo Go does not contain this native module;
- Expo SDK 57;
- Expo Router SDK 57 `/router` adapter;
- `react-native-screens 4.26.x` direct native `Screen` integration, version/source-shape scoped and fail-closed;
- React Navigation native-stack integration target;
- React Native 0.86.x with the version-scoped AndroidX compatibility plugin enabled.

The Expo Router screen-owned path has been validated on device in the repository example. The first npm publication is still blocked on exact-tarball consumer gates, including React Navigation.

The neutral native architecture is additionally certified against the RN 0.87 bare-host line. That evidence does not widen the public package peer range until an equivalent packaged consumer gate passes.

## Config-plugin contract

For navigation-first Expo SDK 57 / RN 0.86.x usage:

```json
[
  "react-native-scroll-interop",
  {
    "android": {
      "rn086AndroidXScroll": true,
      "reactNativeScreensInterop": true
    }
  }
]
```

`rn086AndroidXScroll` preserves the AndroidX typed NON_TOUCH nested-scroll lifecycle for the RN 0.86.x ordinary non-paging ScrollView fling path.

`reactNativeScreensInterop` patches the certified `react-native-screens 4.26.x` native `Screen` to become the real `NestedScrollingParent3` owner and delegate to `ReactNativeNestedScrollParentController`.

Both patches are narrow, version/source-shape scoped and fail closed.

## Native internal layering

The implementation remains split into four logical layers:

```text
com.reactnativescroll.interop.core
com.reactnativescroll.interop.reactnative
com.reactnativescroll.interop.material3
expo.modules.materialtoolbar
```

Only the JavaScript product surface and documented Expo plugin configuration are public package contracts. Kotlin classes remain implementation details unless explicitly promoted later.

## Release discipline

A first public alpha must preserve these gates:

1. native scroll invariants;
2. Material3 adapter invariants;
3. navigation-surface static invariants;
4. RN 0.86 config-plugin invariant;
5. `react-native-screens` integration invariant;
6. npm package-surface invariant;
7. exact-tarball Expo Router navigation-first build/install/runtime gate;
8. exact-tarball React Navigation native-stack build/install/runtime gate.

Navigation runtime gates must cover at least:

- route-owned TopAppBar and layout-owned persistent FloatingToolbar;
- plain screen scroll content with no `NativeScrollHost` on the screen-owned path;
- Home/details navigation and native Material back;
- ordinary scroll and NON_TOUCH fling on both screens;
- return to the previous screen and a new transaction;
- persistent FloatingToolbar observing the active source;
- no duplicate/ambiguous native chrome binding;
- no application-owned TopAppBar safe-area/height constants.

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
