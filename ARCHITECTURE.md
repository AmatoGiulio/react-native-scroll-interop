# Native scroll interop architecture

## Goal

Keep React Native navigation chrome on the platform-native scroll path. React Native identifies the scroll source; native consumers implement platform behavior without an additional per-frame JS callback.


## Alpha.24 native scroll-away geometry

The scroll-away adapter uses React Native 0.83's native top-padding support on the selected `ReactScrollView`. Alpha.24 also mirrors Material3's Android visual-component inset source (`systemBars + displayCutout`) from the root Android window into the embedded Compose TopAppBar explicitly, so the maximum measured host height includes the real Material variant height and physical system inset even when React Native has consumed the local Compose inset chain.

```text
expanded TopAppBar host height (measured native)
        |
        v
ReactScrollView scroll-away top padding
        |
        +-- scrollY 0 .. collapseRange
        |      content rises exactly with TopAppBar collapse
        |
        `-- scrollY > collapseRange
               TopAppBar pinned collapsed; list continues normally

Material snap / settle
        |
        `-- keep rnScrollY = logicalChildY + collapseAmount
            while heightOffset animates
```

This transport-specific bridge is intentionally isolated from the generic Material consumer model. `setScrollAwayTopPaddingEnabledUnstable` is an RN implementation primitive, not a proposed public API; an upstream `react-native-screens` integration could provide equivalent geometry ownership through its screen/scroll registration layer.

## Alpha 19 split

```text
ReactScrollView / FlashList default scroller
        |
        v
Shared RN native scroll hub
  - one ReactScrollViewHelper listener
  - active source discovery
  - visible/same-Fabric-surface filtering
  - display-frame sampling
  - edge overscroll normalization
        |
        v
NativeScrollFrame
  - normalized content delta
  - raw scrollY for diagnostics
  - isolated native post-scroll available distance
        |
        +-------------------------------+
        |                               |
        v                               v
FloatingToolbarScrollConsumer     TopAppBarScrollConsumer
  - Material3 behavior/state       - Material3 behavior/state
  - offsetLimit geometry           - enterAlways pre-scroll adapter
  - Android host translation       - exitUntilCollapsed post-scroll adapter
  - Material3 settle/snap          - Material3 settle/snap
```

Every mounted native chrome host owns only a lightweight registration facade. The actual RN listener and frame sampler are shared, so a visible TopAppBar and FloatingToolbar on the same Fabric surface can receive the same active native scroll sample.

## Consumer boundary

A `NativeScrollConsumer` has no React Native, FlashList, router, or navigation dependency. It receives only:

- session start with the selected native vertical source;
- `NativeScrollFrame`;
- session end.

This is intentional. A future `react-native-screens` transport based on `ScrollViewMarker` / `ScrollViewSeeking` should be able to replace the source side without changing either Material consumer.

## Why TopAppBar needs a richer frame

FloatingToolbar `exitAlways` reacts to consumed content distance, so normalized `deltaY` is enough and Android bounce must be ignored.

Material3 `exitUntilCollapsed` is different: it collapses while content scrolls up through pre-scroll, but expands from positive post-scroll `available` distance only after the content reaches the top edge. RN content-offset sampling can represent the consumed child movement but cannot represent the remaining finger travel once `scrollY` is already zero. Android's visual edge stretch is also too damped to use as gesture distance. Alpha.19 therefore obtains the missing top-boundary distance from a non-consuming native MotionEvent observer in the RN source adapter and exposes it as `NativeScrollFrame.postAvailableY`.

Both `enterAlways` and the collapse phase of `exitUntilCollapsed` are replayed through Material3's own pre-scroll connection. The normalized RN content remainder is then forwarded through post-scroll as consumed distance. At the top boundary, `postAvailableY` is forwarded as Material3 post-scroll available distance so expansion follows the user's remaining drag.

## Invariants

1. No navigation-chrome-specific JS `onScroll` handler.
2. No list ref is required by a native consumer.
3. Scroll sampling and Material state updates stay on the Android UI/native path.
4. A source is dispatched only to attached, shown native chrome clients on the same Fabric surface.
5. Ordinary content delta is normalized independently from top-boundary post-scroll available distance.
6. Material3 remains the source of truth for app-bar/toolbar state and snap behavior.
7. FloatingToolbar's Android translation remains only a WRAP_CONTENT host adaptation; TopAppBar uses Material3's own height/layout state directly.
8. The RN transport is shared across consumers and can be replaced independently of Material behavior code.

## Next checkpoint

Validate alpha.19 in the host app with both consumers and repeat collapse/expand cycles at the top boundary. Once the TopAppBar proof is stable, the next hardening step is source ownership/focus semantics and accessibility (including touch exploration) before extracting the transport into a standalone upstream-oriented PoC.


## Top-boundary post-scroll transport (alpha.19)

`exitUntilCollapsed` needs information that content offset sampling alone cannot provide. Once an RN ScrollView reaches `scrollY == 0`, additional downward finger travel is not content movement; it is nested-scroll `available.y` for the parent chrome. Android visual overscroll displacement is deliberately not used as a proxy because it is a damped/stretch effect and can be much smaller than the user's drag distance.

The RN source adapter therefore has one optional boundary channel:

```text
RN vertical ScrollView
  |
  | normalized scrollY delta -> NativeScrollFrame.deltaY
  |
  `-- at y=0 only: non-consuming downward MotionEvent distance
                         -> NativeScrollFrame.postAvailableY
```

Only consumers that declare `requiresTopBoundaryGesture` activate this observer. `TopAppBarScrollConsumer` requests it for `exitUntilCollapsed`; `FloatingToolbarScrollConsumer` does not. The observer returns `false` for every MotionEvent, so ownership and handling of the gesture stay with React Native. This is an adapter implementation detail, not part of the Material consumer API.


### Alpha.20 logical-child reconciliation

A sampled RN `scrollY` includes pixels that Material3 would have consumed in TopAppBar pre-scroll. For `exitUntilCollapsed`, the adapter therefore models the equivalent logical child position as `max(0, rnScrollY - collapseRange)`. On downward movement, the change in logical child position is replayed as post-scroll `consumed`; any remaining distance is replayed as post-scroll `available` so Material3 expands at the same phase boundary as a real Compose nested-scroll chain. `TopAppBarState.contentOffset` is reconciled to the negative logical child position to prevent state drift.
