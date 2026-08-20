# Architecture

`react-native-scroll-interop` is a general Android nested-scroll interoperability primitive for React Native.
Material3 is the reference native UI consumer; navigation libraries and `react-native-screens` are adapters around the same transport rather than owners of scroll behavior.

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

## Layer 1: neutral core

Package:

```text
com.reactnativescroll.interop.core
```

Owns:

- `SourceScopedNestedScrollLifecycle`
- `NestedScrollConservationLedger`
- `VerticalNestedScrollTransactionDispatcher`
- neutral `VerticalNestedPreScrollConsumer`
- neutral `VerticalNestedPostScrollConsumer`
- neutral `VerticalNestedPostScrollObserver`

The core has no React Native, Material3, Expo, navigation or `react-native-screens` dependency.

## Layer 2: React Native boundary

Package:

```text
com.reactnativescroll.interop.reactnative
```

`ReactVerticalScrollSourceInterop` is the only place that recognizes supported concrete React Native vertical ScrollView implementations.

`ReactNativeNestedScrollParentController` owns:

- `NestedScrollingParentHelper`
- TOUCH/NON_TOUCH source lifecycle
- source identity and replacement rejection
- PRE/POST dispatch
- conservation accounting
- terminal transaction completion

It does not know Material3, navigation libraries or `react-native-screens` and never owns source motion.

Native consumers enter through the neutral composition contract:

```text
ReactNativeNestedScrollParticipantProvider
        -> ReactNativeNestedScrollParticipantSession
        -> core PRE / POST / observer ports
```

`NativeScrollHost` is the standalone public RN component. Its Android implementation and manager live in the RN boundary and are registered through the normal `ReactPackage`/autolinking path.

## Layer 3: screen/container adapters

`ReactNativeScreenNestedScrollBridge` is a navigator-independent Android screen-owner bridge. A screen/container provides:

- owner attach
- layout/content changes
- owner detach
- the real `NestedScrollingParent3` callbacks

The bridge owns RN source discovery and delegates to `ReactNativeNestedScrollParentController`. It contains no Material3, Expo Router, React Navigation or `react-native-screens` concrete type.

The current `react-native-screens 4.26.x` patcher is a compatibility adapter that patches `Screen.kt` only to instantiate and forward to this bridge. It no longer embeds controller/source-locator/Material logic into `react-native-screens`.

The proposed neutral upstream path is documented in `UPSTREAM_REACT_NATIVE_SCREENS.md`.

## Layer 4: Material3 reference consumer

Package:

```text
com.reactnativescroll.interop.material3
```

Material3 owns:

- `TopAppBarScrollConsumer`
- `FloatingToolbarScrollConsumer`
- `Material3TopAppBarNestedScrollAdapter`
- `Material3FloatingToolbarNestedScrollAdapter`
- `Material3NestedScrollRegistry`
- `Material3NestedScrollParticipantProvider`

`Material3NestedScrollParticipantProvider` implements the neutral RN participant-provider contract. It resolves Material chrome for a concrete source and binds the Material adapters to the core PRE/POST/observer ports.

`TopAppBarScrollConsumer` is a consuming PRE/POST participant.

`FloatingToolbarScrollConsumer` is a POST observer and consumes zero source/list distance.

The Compose host implementation retains the historical private Kotlin package `expo.modules.materialtoolbar` in this alpha. That package is an internal implementation namespace only: no Expo Modules Gradle plugin, Expo Modules Kotlin API, module registration file or Expo runtime peer is used. The public native ABI is the RN view-manager ABI (`RNSIMaterialTopAppBar` / `RNSIMaterialToolbar`).

## Layer 5: navigation mapping

The common mapper lives in:

```text
src/navigation/material3NavigationMapper.ts
```

It owns the shared mapping from native-stack-like options to a Material3 header decision/descriptor:

- title
- large-title -> Material3 variant
- default large-title scroll behavior
- back affordance
- Material-specific options
- unsupported/native-header fallback

It imports neither Expo Router nor React Navigation and contains no nested-scroll logic.

`Material3NavigationHeader` is the shared renderer for the resulting descriptor.

Public pure mapping entry point:

```text
react-native-scroll-interop/navigation
```

## Layer 6: thin navigation adapters

### Expo Router

```text
react-native-scroll-interop/router
```

The adapter wraps Expo Router's existing `Stack`, normalizes its native-stack option/header props, delegates all Material decisions to the common mapper, and preserves Expo Stack statics. It creates no navigation state and contains no scroll transport logic.

### React Navigation

```text
react-native-scroll-interop/react-navigation
```

The adapter exposes option transformers for native-stack navigator and screen options. It uses a structural native-stack contract and therefore adds no `@react-navigation/*` runtime or peer dependency to the package.

Both adapters render the same `Material3NavigationHeader` and therefore share exactly one Material3/navigation mapping policy.

## Parent ownership

### Navigation-first

With the current screens compatibility adapter:

```text
Expo Router or React Navigation
          |
react-native-screens Screen
          |
ReactNativeScreenNestedScrollBridge
          |
ReactNativeNestedScrollParentController
          |
neutral participant ports
          |
Material3 reference provider (optional consumer)
```

Normal page components remain ordinary React Native vertical scroll content and do not need `NativeScrollHost` when the screen owns the parent relationship.

### Standalone

```text
NativeScrollHost
    |
ReactNativeNestedScrollParentController
    |
neutral participant ports
    |
Material3 reference provider (optional consumer)
```

## React Native compatibility

The compatibility machinery remains version-scoped to RN 0.86.x and the certified RN 0.87 line.

For both lines it:

1. builds ReactAndroid from the installed source tree;
2. selects `ReactNestedScrollViewManager` in both `MainReactPackage` manager creation paths;
3. patches only the ordinary non-paging fling path;
4. keeps paging/snap on React Native's existing branch;
5. delegates ordinary fling to AndroidX `NestedScrollView.fling()` so the source enters the real TYPE_NON_TOUCH nested-scroll lifecycle.

The patcher is idempotent and fail-closed when an unsupported version/source shape is encountered.

## Explicitly forbidden

- parent-owned source `Scroller` / `OverScroller`
- parent `scrollBy` / `scrollTo` on the RN source
- sampled position as the transport
- timer/reconstructed momentum
- duplicate velocity integration
- parent-started fake nested sessions
- concrete RN ScrollView typing outside the RN compatibility boundary
- Material3 knowledge in the neutral core or RN controller
- Material3/navigation knowledge in the `react-native-screens` patch
- scroll transport logic in Expo Router or React Navigation adapters
- FloatingToolbar consuming PRE/POST distance
- duplicate navigation state inside this package
- Expo Modules registration/runtime dependency

## Gates

`npm run check` guards:

- architecture layer boundaries
- scroll ownership/conservation
- Material3 adapter boundaries
- common navigation mapper + thin adapters
- RN 0.86.x / 0.87 source compatibility transformations
- neutral `react-native-screens 4.26.x` bridge transformation
- single Android runtime source tree
- npm tarball surface

Runtime release gates remain Android build/device tests. Static gates do not replace them when runtime/controller code changes.
