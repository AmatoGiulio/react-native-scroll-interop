# react-native-screens upstream path

`react-native-scroll-interop` currently supports `react-native-screens 4.26.x` through a
version-scoped container adapter around the generic React Native boundary. The adapter is ownership
plumbing, not nested-scroll transport and not Material3 behavior.

## Current adapter boundary

The 4.26.x path does only host ownership work:

- the native screen/container participates as an AndroidX nested-scroll parent;
- attach/layout/detach lifecycle is forwarded to `ReactNativeScreenNestedScrollBridge`;
- Android nested-scroll callbacks are forwarded unchanged;
- the adapter has no Material3 or navigation-option knowledge;
- the transformation fails closed outside the validated source shape.

`ReactNativeScreenNestedScrollBridge` resolves the unique RN vertical source and delegates to `ReactNativeNestedScrollParentController`, whose consumers are supplied only through neutral PRE/POST/observer ports.

## Upstream-neutral seam

The proposed seam is open as
[`react-native-screens #4537`](https://github.com/software-mansion/react-native-screens/pull/4537).
It is owned by `react-native-screens` and expressed only in Android / AndroidX terms. It does not
import `react-native-scroll-interop`, Material3, Expo Router, or React Navigation.

A suitable shape is an optional screen-owned `NestedScrollingParent3` delegate plus explicit attach/detach/layout hooks.

The important contract is:

1. React Native remains the touch, position, and fling-physics owner.
2. Existing screens-owned behavior runs first.
3. External delegates receive only remaining signed nested-scroll distance.
4. Android nested-scroll `type` is preserved.
5. Parent3 consumed accounting is preserved.
6. Screen/source lifecycle remains explicit.
7. With no delegate installed, stock `react-native-screens` behavior is unchanged.

## Migration plan

1. Keep the fail-closed 4.26.x adapter as the recorded alpha compatibility path.
2. Upstream the neutral AndroidX delegate seam.
3. Add a version-gated adapter for the first released screens version containing that seam.
4. Remove source patching from the preferred path while retaining older compatibility only while it remains useful and supportable.

This upstream seam is an independent ownership improvement, not a transport dependency and not a
blocker for `0.1.0-alpha.1`. React Native's separate `TYPE_NON_TOUCH` source-lifecycle work is
tracked in [React Native #57972](https://github.com/react/react-native/pull/57972).
