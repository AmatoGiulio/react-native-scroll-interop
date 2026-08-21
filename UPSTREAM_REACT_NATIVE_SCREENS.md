# react-native-screens upstream path

`react-native-scroll-interop` currently keeps a fail-closed compatibility patch for `react-native-screens 4.26.x`. The long-term target is an Android nested-scroll extension point owned by `react-native-screens`, with no dependency on this package or on Material3.

## What changed upstream

Current `react-native-screens` development has already moved further than the 4.26.x architecture:

- the stable path used by current React Navigation native-stack renders `ScreenStack` / `ScreenStackItem` and owns a `ScreensCoordinatorLayout` around each screen;
- the new Stack API owns a `StackHeaderCoordinatorLayout` around its screen;
- Stack v5 already uses Android nested scroll for its own Material3 AppBar behavior;
- `ScrollViewMarker`, `Container` and `ContainerItem` already let screens identify content scroll views for internal behavior.

Therefore the upstream proposal should not make `Screen` itself become a new nested-scroll parent. The correct seam is the CoordinatorLayout already owned by each stack path.

## Neutral seam

The prototype exposes an optional AndroidX-only delegate:

```kotlin
interface ScreenNestedScrollDelegate : NestedScrollingParent3 {
    fun onScreenAttached(screen: ViewGroup) = Unit
    fun onScreenDetached(screen: ViewGroup) = Unit
    fun onScreenLayout(screen: ViewGroup) = Unit
}
```

`react-native-screens` owns the container and always processes its existing behaviors first. Only the remaining nested-scroll distance is offered to the optional external delegate.

The same internal forwarding base is used by:

```text
current native-stack
  ScreenStack / ScreenStackItem
    -> ScreensCoordinatorLayout
       -> existing screens behaviors first
       -> optional external delegate

new Stack API
  StackScreen
    -> StackHeaderCoordinatorLayout
       -> existing screens Material/AppBar behavior first
       -> optional external delegate
```

With no delegate installed, behavior is unchanged.

## External integration

`react-native-scroll-interop` can supply the optional delegate by adapting its existing `ReactNativeScreenNestedScrollBridge`. Source discovery, transaction accounting and native consumers remain outside `react-native-screens`.

This is the intended ownership split:

```text
react-native-screens
  owns screen/container/navigation behavior
  owns first right to consume its own nested-scroll behavior

optional external integration
  receives the remaining real Android nested-scroll transaction
  does not replace React Native scroll physics
```

The external adapter is compiled only when the installed `react-native-screens` source actually contains the upstream seam. The existing 4.26.x compatibility path remains available until an official screens release ships the new API.

## Required invariants

Any upstream implementation must preserve these properties:

1. React Native remains the owner of touch handling, source position and fling physics.
2. `react-native-screens` does not call `scrollBy`, `scrollTo` or reconstruct momentum from JS events for this integration.
3. Existing screens-owned AppBar, form-sheet and bottom-sheet behavior runs before an external delegate.
4. Android nested-scroll `type` (`TOUCH` / `NON_TOUCH`) is preserved.
5. Parent3 consumed-distance accounting is preserved; an external delegate receives only distance still available after screens-owned behavior.
6. Attach, layout and detach are explicit lifecycle events.
7. The public seam contains no Material3, Expo Router, React Navigation or `react-native-scroll-interop` concepts.
8. With no delegate installed, existing behavior is unchanged.

## Migration plan

1. Keep the current fail-closed 4.26.x patcher as the certified compatibility adapter.
2. Validate the neutral container-level seam against both current native-stack and the new Stack API.
3. Propose the minimal generic change upstream to `react-native-screens`.
4. Add a release-gated external adapter once an official screens version contains the seam.
5. Stop source-patching supported new screens versions while retaining the 4.26.x compatibility route for the alpha line.

The goal is not to upstream a toolbar. The goal is to make the real Android nested-scroll transaction available at the navigation container boundary so independent native integrations can participate without `react-native-screens` knowing what those integrations are.
