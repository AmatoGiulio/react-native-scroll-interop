# Architecture

`react-native-scroll-interop` is a general React Native / Android nested-scroll primitive. Material3 is the reference native consumer, not the transport core.

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

Owns transaction conservation, source-scoped lifecycle, PRE/POST participants and `VerticalNestedScrollTransactionDispatcher`. It has no Material3, navigation-library, Expo or concrete React Native ScrollView dependency.

### React Native boundary

```text
android/src/main/java/com/reactnativescroll/interop/reactnative/
```

Owns React Native source recognition, `ReactNativeNestedScrollParentController`, the standard `ReactPackage`, `NativeScrollHost` native view/manager and RN direct-event bridge.

`ReactNativeNestedScrollParentController` translates the real Android parent callbacks into the neutral core. It never owns source motion.

### Material3 consumers

Behavior layer:

```text
android/src/main/java/com/reactnativescroll/interop/material3/
```

- `TopAppBarScrollConsumer`: PRE/POST consumer.
- `FloatingToolbarScrollConsumer`: POST observer; consumes zero list distance.
- Material3 nested-scroll adapters translate neutral core ports to Material state.

UI/reference-integration layer:

```text
android/src/main/java/com/reactnativescroll/interop/material3/ui/
```

Owns `MaterialTopAppBarView`, `MaterialToolbarView`, their React Native view managers, Compose hosting, placement/insets and the Material participant registry. This layer sits above the core and React Native boundary.

The Android namespace is `com.reactnativescroll.interop`; the old `android/src/main/java/expo/...` implementation tree is removed. Expo Modules are not required by the runtime.

## Parent ownership

### Standalone

```text
NativeScrollHost
  -> ReactNativeNestedScrollHostView
  -> ReactNativeNestedScrollParentController
  -> neutral dispatcher
  -> React Native vertical source
```

`NativeScrollHost` is a standard React Native native component and works in bare RN.

### Navigation / react-native-screens

For the currently certified `react-native-screens 4.26.x` path, the patcher makes the native `Screen` the real `NestedScrollingParent3` ancestor and forwards lifecycle/callbacks to `ReactNativeNestedScrollParentController`.

This integration is an adapter of the core, not part of Material3. The planned upstream-neutral extension point is documented in [`UPSTREAM_REACT_NATIVE_SCREENS.md`](./UPSTREAM_REACT_NATIVE_SCREENS.md). The proposed upstream API contains only Android/AndroidX ownership concepts and no dependency on this package, Material3, Expo Router or React Navigation.

## React Native compatibility adapter

`plugin/reactNativeScrollCompatPatch.js` owns the version-scoped RN 0.86/0.87 source compatibility transformation. `plugin/bareReactNativeScrollCompat.js` applies it to a standard Community RN host; `plugin/withScrollInterop.js` applies the same compatibility machinery during Expo prebuild.

This build/source compatibility layer is separate from scroll transaction semantics.

## Navigation architecture

One shared Material3/navigation mapper owns the navigation semantics:

```text
src/navigation/material3NavigationMapper.ts
                 |
        +--------+--------+
        |                 |
 Expo Router adapter   React Navigation adapter
    router.tsx          react-navigation.tsx
        |                 |
        +--------+--------+
                 |
        MaterialTopAppBar
```

The mapper translates title, large-title, Back and Material3 header options. It has no scroll transport logic and imports neither navigation library.

### Expo Router adapter

`react-native-scroll-interop/router` wraps Expo Router's existing `Stack`, preserves its navigation state/statics and delegates header semantics to the shared mapper. Unsupported header behavior falls back to the platform-native header.

### React Navigation adapter

`react-native-scroll-interop/react-navigation` exposes:

- `material3NativeStackNavigatorOptions`
- `material3NativeStackScreenOptions`
- `withMaterial3NativeStackOptions`

It adapts React Navigation native-stack options to the same mapper and renders the same `MaterialTopAppBar`. It does not own scroll state, source identity or nested-scroll callbacks.

## Material3 reference behavior

`MaterialTopAppBar` and `MaterialToolbar` are real consumers proving that the generic primitive can drive native UI synchronously from the same nested-scroll transaction while React Native keeps source physics.

Material terminal settling uses Material state only; it never starts a second source fling.

## Explicitly forbidden

- parent-owned source `Scroller` / `OverScroller`
- parent `scrollBy` / `scrollTo` on the RN source
- sampled position as transport
- timer/reconstructed momentum
- duplicate velocity integration
- parent-started fake nested sessions
- concrete RN ScrollView typing outside the RN compatibility boundary
- Material3 knowledge in the neutral core
- navigation-library knowledge in the neutral core or Material behavior consumers
- scroll transport logic in Expo Router / React Navigation adapters
- FloatingToolbar consuming PRE/POST list distance
- duplicate navigation state inside this package

## Gates

`npm run check` guards the core conservation contract, Material3 layering, navigation mapper/adapters, RN 0.86/0.87 compatibility transforms, the `react-native-screens 4.26.x` adapter and npm package surface.

Runtime/build gates are still required when native/runtime source changes; static gates do not replace them.
