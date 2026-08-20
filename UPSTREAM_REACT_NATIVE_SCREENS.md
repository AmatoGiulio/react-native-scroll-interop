# react-native-screens upstream path

## Goal

Replace the version-scoped `react-native-screens 4.26.x` source patch with a neutral screen-owner
nested-scroll integration that can live upstream without any Material3, Expo Router, or
`react-native-scroll-interop` product semantics.

The current patch remains a compatibility adapter while this contract is proposed upstream.

## What the screen layer actually needs to own

A native screen/container already knows when it is attached, laid out, detached, and which React
Native content subtree it owns. That is sufficient to host a real Android `NestedScrollingParent3`
relationship without knowing what consumes the transaction.

The upstream-facing responsibilities are intentionally small:

1. expose or host a `NestedScrollingParent3` delegate for the screen-owned content subtree;
2. notify that delegate on owner attach, layout/content replacement, and detach;
3. forward Android's real nested-scroll callbacks synchronously;
4. keep the React Native scrolling descendant as the owner of touch handling, source position, and
   fling physics;
5. never translate nested-scroll frames into navigation or UI-library state.

## Reference boundary in this repository

`ReactNativeScreenNestedScrollBridge` is the reference implementation of that neutral contract:

```text
react-native-screens Screen
        |
        | owner attach / layout / detach
        | NestedScrollingParent3 callbacks
        v
ReactNativeScreenNestedScrollBridge
        |
        v
ReactNativeNestedScrollParentController
        |
        v
neutral PRE / POST / observer ports
```

The bridge owns RN source discovery and delegates transaction lifecycle to the RN controller. It
contains no import or knowledge of:

- Material3;
- Expo Router;
- React Navigation;
- `react-native-screens` concrete classes;
- any native chrome registry.

The current `plugin/reactNativeScreensInteropPatch.js` therefore patches `Screen.kt` only to create
and forward to this bridge. It no longer injects source discovery, controller lifecycle, or Material
behavior directly into `react-native-screens`.

## Candidate upstream API shape

The exact upstream API should be chosen with the `react-native-screens` maintainers, but the needed
shape is equivalent to a screen-owned delegate with these lifecycle methods:

```kotlin
interface ScreenNestedScrollDelegate : NestedScrollingParent3 {
  fun onOwnerAttached()
  fun onOwnerLayout()
  fun onOwnerDetached()
}
```

A library integration could provide a delegate factory for a screen/content root. An upstream
implementation may choose a different name or registration mechanism; the invariant is that the
screen exposes only lifecycle + real Android nested-scroll callbacks, not Material or package-specific
consumer types.

## Non-goals

An upstream change must not:

- create a parent-owned `Scroller` or `OverScroller`;
- call `scrollBy` / `scrollTo` on the React Native source;
- sample `scrollY` as the transport;
- reconstruct momentum with timers or velocity integration;
- add Material3 or navigation-library dependencies to `react-native-screens`;
- make route identity the authority for scroll frames.

## Migration plan

1. Keep the fail-closed 4.26.x patcher as the certified compatibility path.
2. Validate `ReactNativeScreenNestedScrollBridge` through the existing Expo 57 / RN 0.86 navigation
   runtime gate.
3. Propose the neutral screen-owner delegate contract upstream.
4. When an upstream API is released, add an adapter that uses it without source patching.
5. Remove the 4.26.x patcher only after the upstream path has an equivalent runtime gate.

Until step 4 exists in a released `react-native-screens`, the patcher remains intentionally
version-scoped and is not presented as a permanent upstream solution.
