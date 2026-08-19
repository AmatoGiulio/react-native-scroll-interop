# Architecture

`react-native-scroll-interop` exposes React Native's real Android nested-scroll transaction to native UI consumers.

The invariant is:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native UI consumers
```

React Native owns gesture handling, source position and fling initiation/physics. The package never drives the source with a parent scroller, `scrollBy`, `scrollTo`, sampled `scrollY`, timers or per-frame JavaScript transport.

## Transaction

```text
requested dy
  -> PRE consumers
  -> React Native source consumes/moves
  -> POST consumers
  -> POST observers
  -> remaining
```

Conservation is checked against the real synchronous Android callback values:

```text
requested = preConsumed + childConsumed + postConsumed + remaining
```

## Layers

### Neutral core

Package:

```text
com.reactnativescroll.interop.core
```

Source:

```text
android-shared/src/main/java/com/reactnativescroll/interop/core/
```

Owns:

- `SourceScopedNestedScrollLifecycle`
- `NestedScrollConservationLedger`
- `VerticalNestedScrollTransactionDispatcher`
- neutral PRE/POST consumer and observer ports

It has no Expo, Material3 or concrete React Native ScrollView dependency.

### React Native boundary

Package:

```text
com.reactnativescroll.interop.reactnative
```

`ReactVerticalScrollSourceInterop` recognizes the supported React Native vertical source implementations at the compatibility boundary and exposes only Android-level capabilities to the rest of the transport.

`ReactNativeNestedScrollParentController` owns:

- `NestedScrollingParentHelper`
- TOUCH/NON_TOUCH source lifecycle
- participant binding
- PRE/POST dispatch
- conservation accounting
- stale callback/source replacement rejection
- terminal transaction completion

It does not own source motion.

### Material3 consumers

Package:

```text
com.reactnativescroll.interop.material3
```

`TopAppBarScrollConsumer` is a PRE/POST consumer.

`FloatingToolbarScrollConsumer` is a POST observer. It consumes zero source/list distance.

Material terminal settling uses the Material state only; it does not start a second source fling.

### Expo/native integration

The existing Android Expo-module implementation namespace is:

```text
expo.modules.materialtoolbar
```

This layer owns native view registration, screen/chrome registry resolution, standalone source discovery, Compose host placement/insets and config-plugin integration.

The npm/public identity is only:

```text
react-native-scroll-interop
```

## Parent ownership

### Navigation-first

With `reactNativeScreensInterop`:

```text
Expo Router / React Navigation
          ↓
react-native-screens 4.26.x Screen
          ↓
NestedScrollingParent3
          ↓
ReactNativeNestedScrollParentController
          ↓
React Native vertical source
```

The config plugin patches the certified `react-native-screens 4.26.x` `Screen.kt` source and injects the Gradle dependency on this module.

The native screen owns the parent/controller relationship; normal page components do not need `NativeScrollHost`.

The actual Android nested-scroll target remains transaction authority. Route/screen identity selects the relevant chrome but never transports scroll frames.

### Standalone

```text
NativeScrollHost
    ↓ source discovery
ReactNativeNestedScrollParentController
    ↓
React Native vertical source
```

`ReactNativeNestedScrollHostView` only discovers a unique supported descendant and delegates parent callbacks to the same reusable controller.

## React Native compatibility

The config option is:

```text
android.reactNativeScrollCompat = true
```

It is intentionally version-scoped to RN 0.86.x and 0.87.x.

For both lines the plugin:

1. configures the generated Expo Android project to build ReactAndroid from the installed source tree;
2. selects `ReactNestedScrollViewManager` in both `MainReactPackage` manager creation paths;
3. patches only the ordinary non-paging fling path;
4. keeps paging/snap on React Native's existing `flingAndSnap` branch;
5. delegates ordinary fling to `super.fling(correctedVelocityY)` so AndroidX enters its real TYPE_NON_TOUCH nested-scroll lifecycle.

The source shape differs by RN line:

```text
RN 0.86.x -> ReactNestedScrollView.java
RN 0.87.x -> ReactNestedScrollView.kt
```

The patcher is idempotent and fail-closed. Any RN version outside 0.86.x/0.87.x or an unexpected source shape stops prebuild instead of applying a partial transformation.

## Screen/chrome binding

`NativeNestedScrollRegistry` binds Material chrome to the actual screen/source relationship.

TopAppBar resolution prefers the exact matching `react-native-screens` native Screen ancestor so outgoing/incoming transition screens do not bind each other's route chrome.

FloatingToolbar may remain navigation-layout scoped and observe the active source.

Registry resolution selects participants only; transaction values still come from Android nested-scroll callbacks.

## TopAppBar

`MaterialTopAppBar` Android scroll behavior is native Material3.

The consumer:

- fails closed until Material geometry is finite;
- consumes real PRE/POST nested distance;
- clamps consumption to available Android distance;
- never mutates source position.

`placement="header"` is JavaScript layout sizing/safe-area behavior, not transport behavior.

## FloatingToolbar

`MaterialToolbar.Root` maps the child-consumed POST transaction to Material3 FloatingToolbar state when `scrollBehavior="exitAlways"`.

It is observation-only with respect to the source transaction.

Placement, alignment, insets, IME behavior and colors remain view-layer concerns.

## Expo Router adapter

`react-native-scroll-interop/router` wraps Expo Router's existing `Stack`.

It does not create navigation state or a navigator.

On Android it translates the supported native-stack title/large-title/back semantics to `MaterialTopAppBar`. Unsupported custom header behavior falls back to Expo Router's platform-native header.

On iOS/web it removes the `material3` namespace and otherwise forwards the existing stack options.

## Explicitly forbidden

- parent-owned source `Scroller` / `OverScroller`
- parent `scrollBy` / `scrollTo` on the RN source
- sampled position as the transport
- timer/reconstructed momentum
- duplicate velocity integration
- parent-started fake nested sessions
- concrete RN ScrollView typing outside the compatibility boundary
- Material3 knowledge in the neutral core
- FloatingToolbar consuming PRE/POST distance
- page-level `NativeScrollHost` on the certified screen-owned navigation path
- duplicate navigation state inside this package

## Gates

`npm run check` guards:

- scroll ownership/conservation
- Material3 adapter boundaries
- navigation API shape
- RN 0.86.x and RN 0.87.x source compatibility transformations
- `react-native-screens 4.26.x` source transformation
- npm tarball surface

Runtime release gates remain device/build tests; static gates do not replace them.
