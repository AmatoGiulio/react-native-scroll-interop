# Architecture

`react-native-scroll-interop` is a general React Native / Android nested-scroll primitive. Material3 is the shipped reference native consumer, not the transport core.

```text
one React Native scroll physics
one synchronous Android nested-scroll transaction
N native consumers
```

React Native owns touch handling, source position and fling physics. The package never moves the source with a parent scroller, `scrollBy`, `scrollTo`, sampled `scrollY`, timers or per-frame JavaScript transport.

## Transaction

```text
requested dy
  -> PRE consumers
  -> React Native source consumes/moves
  -> POST consumers
  -> POST observers
  -> remaining
```

```text
requested = preConsumed + childConsumed + postConsumed + remaining
```

## Layers

### Neutral core

```text
android/src/main/java/com/reactnativescroll/interop/core/
```

Owns source-scoped lifecycle, conservation accounting, neutral PRE/POST/observer ports and `VerticalNestedScrollTransactionDispatcher`. It has no React Native implementation, Material3, navigation-library, Expo or `react-native-screens` dependency.

### React Native boundary

```text
android/src/main/java/com/reactnativescroll/interop/reactnative/
```

Owns React Native vertical-source recognition, `NativeScrollHost`, the stable `ReactNativeNestedScrollParentController` facade and its consumer-agnostic transaction engine.

Native consumers enter only through `ReactNativeNestedScrollParticipantProvider` / `ReactNativeNestedScrollParticipantSession`. The RN controller sees neutral core PRE/POST/observer ports; it does not import Material3.

`ReactNativeScreenNestedScrollBridge` is the generic screen/container owner. It discovers the unique RN vertical source, owns attach/layout/detach binding and forwards the AndroidX `NestedScrollingParent3` callbacks to the same RN controller. It has no Material3 or navigation-library dependency.

### Material3 consumers

Behavior layer:

```text
android/src/main/java/com/reactnativescroll/interop/material3/
```

- `TopAppBarScrollConsumer`: PRE/POST consumer.
- `FloatingToolbarScrollConsumer`: POST observer; consumes zero list distance.
- Material3 nested-scroll adapters translate the neutral core ports to Material state.

UI/reference-integration layer:

```text
android/src/main/java/com/reactnativescroll/interop/material3/ui/
```

Owns `MaterialTopAppBarView`, `MaterialToolbarView`, their React Native managers, Compose hosting, placement/insets, the Material registry and `Material3NestedScrollParticipantProvider`.

`ReactNativeScrollInteropPackage` is the composition root: it registers the standard RN view managers and installs Material3 as the reference participant provider. Replacing or adding native consumers does not require changing the neutral core or RN transaction engine.

The Android namespace is `com.reactnativescroll.interop`; the historical `android/src/main/java/expo/...` implementation tree is removed. Expo Modules are not required by the runtime.

## Parent ownership

### Standalone

```text
NativeScrollHost
  -> ReactNativeNestedScrollHostView
  -> ReactNativeNestedScrollParentController
  -> neutral dispatcher
  -> React Native vertical source
```

`NativeScrollHost` is a standard React Native native component and works in bare RN. It discovers the source but does not own source motion.

### Navigation / react-native-screens

For the currently certified `react-native-screens 4.26.x` line:

```text
react-native-screens Screen
  -> NestedScrollingParent3
  -> ReactNativeScreenNestedScrollBridge
  -> ReactNativeNestedScrollParentController
  -> neutral dispatcher
```

The source patch imports only the neutral screen bridge. It contains no Material3, Expo Router or React Navigation logic.

The future upstream-neutral path is specified in [`react-native-screens.md`](./react-native-screens.md): `react-native-screens` should expose an optional AndroidX nested-scroll delegate seam rather than depending on this package.

## React Native compatibility adapter

`plugin/reactNativeScrollCompatPatch.js` owns the version-scoped RN 0.86/0.87 source compatibility transformation. `plugin/bareReactNativeScrollCompat.js` applies it to a standard Community RN host; `plugin/withScrollInterop.js` applies the same machinery during Expo prebuild.

This source/build compatibility layer is separate from transaction semantics.

## Navigation architecture

Navigation semantics and rendering are shared independently of the navigator:

```text
src/navigation/material3NavigationMapper.ts
                 |
src/navigation/Material3NavigationHeader.tsx
                 |
        +--------+--------+
        |                 |
 Expo Router adapter   React Navigation adapter
    router.tsx          react-navigation.tsx
```

The mapper decides title, large-title, Back, Material3 options and platform-native fallback. It imports neither navigation library and contains no scroll transport.

`Material3NavigationHeader` is the shared Material3 renderer. It is the only navigation layer that turns the normalized descriptor into `MaterialTopAppBar` props.

The mapper/header pair is an internal implementation detail shared by exactly the two public adapters; the package intentionally does not add a third `/navigation` entry point in this alpha.

### Expo Router adapter

`react-native-scroll-interop/router` wraps Expo Router's existing `Stack`, preserves navigation state/statics and delegates semantics/rendering to the shared navigation layer.

### React Navigation adapter

`react-native-scroll-interop/react-navigation` exposes:

- `material3NativeStackNavigatorOptions`
- `material3NativeStackScreenOptions`
- `withMaterial3NativeStackOptions`

It uses a structural native-stack option shape and contains no runtime import from React Navigation. The optional peer range documents the currently targeted native-stack v7 line.

Neither navigation adapter owns source identity, scroll state or nested-scroll callbacks.

## Material3 reference behavior

`MaterialTopAppBar` and `MaterialToolbar` prove that the generic primitive can drive native UI synchronously from the real Android nested-scroll transaction while React Native retains source physics.

Material terminal settling uses Material state only; it never starts a second source fling.

## Explicitly forbidden

- parent-owned source `Scroller` / `OverScroller`
- parent `scrollBy` / `scrollTo` on the RN source
- sampled position as transport
- timer/reconstructed momentum
- duplicate velocity integration
- parent-started fake nested sessions
- concrete RN ScrollView typing outside the RN compatibility boundary
- Material3 knowledge in the neutral core or RN transaction engine
- navigation-library knowledge in the neutral core / RN transaction engine / Material behavior consumers
- scroll transport logic in Expo Router / React Navigation adapters
- `react-native-screens` source patch knowledge of Material3
- FloatingToolbar consuming PRE/POST list distance
- duplicate navigation state inside this package

## Gates

`npm run check` includes an explicit architecture-boundary gate plus ownership/conservation, Material3, navigation, RN 0.86/0.87 compatibility, `react-native-screens 4.26.x` and npm package-surface checks.

Runtime/build gates are still required when native/runtime source changes; static gates do not replace them.
