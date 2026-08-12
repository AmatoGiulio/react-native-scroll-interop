# Native scroll interop architecture

## Goal

Keep React Native in complete ownership of scrolling while native screen chrome participates in the same Android nested-scroll transaction.

The invariant is simple:

> React Native owns the gesture, the fling, the physics and the child movement. Native chrome may consume part of the source's real nested-scroll transaction, but it never drives or reconstructs the scroll.

There is no per-frame JS callback, no sampled `scrollY` transport, no parent-owned `OverScroller`, and no parent call to `scrollBy` / `scrollTo` on the source.

## Current shape

```text
ReactScrollView / FlashList
        |
        | real Android nested scroll
        | TOUCH and TYPE_NON_TOUCH
        v
ExpoNestedScrollHostView
  NestedScrollingParent3
        |
        +-----------------------------+
        |                             |
        v                             v
TopAppBarScrollConsumer        FloatingToolbarScrollConsumer
  pre + post participant         post observer/participant
  may consume distance           consumes no list distance
        |                             |
        v                             v
Material3 TopAppBar            Material3 FloatingToolbar
ScrollBehavior                 ScrollBehavior
```

`ExpoNestedScrollHostView` is only the prototype home for the parent. In an upstream integration the natural owner is the screen/navigation layer, which already sits above the screen content and knows which chrome belongs to it.

## One transaction, one driver

For a vertical delta `dy`, the transaction is:

```text
source asks to move by dy
        |
        v
parent pre-scroll
  TopAppBar may consume chromePre
        |
        v
source moves itself by the remainder
  childConsumed is reported by the source
        |
        v
parent post-scroll
  TopAppBar may consume some dyUnconsumed
  FloatingToolbar observes childConsumed
        |
        v
final unconsumed distance / source edge behavior
```

The frame invariant is:

```text
requested = chromePre + childConsumed + chromePost + remaining
```

No term is reconstructed from a previous frame. The debug transaction ledger in `ExpoNestedScrollHostView` checks this equation against the callbacks Android actually delivers.

The important ownership rule is that pre-scroll only *reports consumption*. It does not execute the child phase. React Native receives the remainder and performs its normal scroll itself. Post-scroll then receives the real `dyConsumed` and `dyUnconsumed` produced by the source.

## Touch and momentum

### Touch

The source owns touch through its normal Android `ScrollView.onTouchEvent` path. The host participates through nested scrolling and never intercepts the gesture.

React Native 0.83 uses `android.widget.ScrollView`, whose legacy touch loop has one structural limitation: its post-scroll dispatch does not expose the `NestedScrollingParent3 consumed[]` result back to the source. A parent can correctly consume top-edge post-scroll distance to expand the app bar, but platform `ScrollView` cannot subtract that post consumption before deciding what remains for overscroll.

This is a source-layer limitation, not something the parent can repair without replacing the source's touch loop.

### Momentum

The fling must remain owned by React Native's own `OverScroller`.

Stock React Native 0.83 moves a fling from `android.widget.ScrollView.computeScroll()` without delivering the movement as `TYPE_NON_TOUCH` nested-scroll frames. The prototype patch under `docs/upstream/` closes only that visibility gap: the source wraps the movement it was already going to perform in a normal nested-scroll transaction.

The parent never takes the fling, estimates a velocity, runs an `OverScroller`, or replays sampled deltas.

```text
RN OverScroller frame
        |
        v
nested pre-scroll
        |
        v
RN applies the remainder
        |
        v
nested post-scroll
```

A source backed by AndroidX `NestedScrollView` should provide this contract itself. The parent must not care whether the source is a patched 0.83 `ReactScrollView` or a future nested-scroll-native implementation.

## Session lifecycle

Touch and momentum are two phases of one user movement.

The source can open its `TYPE_NON_TOUCH` nested session before the touch session finishes. When that happens the host must not settle Material chrome at touch stop; it waits until the momentum session actually ends. Only then does it call the Material behavior's terminal settle/snap.

The settle does not move the list and does not receive the fling velocity a second time. Every fling frame has already reached Material as scroll distance, so terminal settle is invoked with zero velocity to avoid integrating the same momentum twice.

## Chrome geometry

`scrollY` has one meaning again:

```text
scrollY = where React Native scrolled the source
```

TopAppBar collapse is not encoded into `scrollY`.

The current standalone-module bridge uses React Native's scroll-away top-padding primitive to reserve the expanded native app-bar height. As Material collapses the bar, the source content child is translated by the current collapse amount:

```text
expanded chrome height = H
collapse amount        = C
content translationY   = H - C
```

This is visual geometry only. It does not perform a scroll, does not modify the source physics and does not participate in transaction accounting.

This geometry bridge is still prototype-specific. An upstream screen implementation should prefer geometry owned by the screen/container rather than depending on the internal content child of `ReactScrollView`.

## Consumers

### TopAppBar

The TopAppBar is a true participant.

- In pre-scroll it may withhold distance from the list while Material changes `heightOffset`.
- It reports at most the distance the chrome actually moved. Material can report more than its clamped state moved at an endpoint; withholding that larger value would delete gesture distance.
- In post-scroll it receives the source's real child-consumed and unconsumed distances, allowing `exitUntilCollapsed` to expand at the top edge.
- Its snap changes Material state and the chrome geometry only; it never reconciles the list with `scrollTo`.

### FloatingToolbar

The FloatingToolbar is a post-scroll observer/participant.

It receives the source's real `dyConsumed`. It consumes zero distance from the list. While a TopAppBar consumes the whole pre-scroll delta, `dyConsumed` can correctly be zero, matching the phase ordering of a native Compose nested-scroll chain.

## Source and chrome registration

The registry pairs a source with at most one eligible TopAppBar and one eligible FloatingToolbar in the same native/Fabric scope. Ambiguity fails closed rather than selecting a source heuristically.

The current standalone module still discovers the ReactScrollView by walking the host descendants and retries discovery after mount. It also force-enables nested scrolling for the actual native ScrollView because FlashList 2.0.2 does not forward the setting reliably in this setup.

That discovery is prototype plumbing, not part of the desired upstream architecture. A screen layer should own explicit source/chrome registration because the screen already knows which content belongs to it.

## Measured invariants

The current transaction ledger was stressed with slow drag, hard fling, direction reversal, top edge, bottom edge and touch interruption of momentum:

| Screen | Source | Chrome | Ledger frames | Broken |
|---|---|---|---:|---:|
| Feed | FlashList | small `enterAlways` | 177 | 0 |
| Profile | RN ScrollView | large `exitUntilCollapsed` | 251 | 0 |
| Gallery | FlashList | large `exitUntilCollapsed` | 138 | 0 |

Total: 566 accounted frames, 0 broken transactions.

At the top boundary the source and chrome also split the real gesture correctly. One measured sequence was:

```text
requested=-48 -> child=-47, chrome=-1
requested=-26 -> child=0,   chrome=-26
```

The second frame also demonstrates the 0.83 platform `ScrollView` touch limitation described above: the parent consumes the 26 pixels correctly, but the legacy source cannot receive that Parent3 post-consumption value before its own overscroll decision.

## FlashList hard-fling blank window

A transient blank FlashList window under violent fling is reproducible, but controlled frame-by-frame recordings show that it is not introduced by this transport or by the chrome geometry:

| Run | Our geometry | Frames | Blank frames |
|---|---|---:|---:|
| App bar present | padding + translation | 38 | 12 |
| App bar removed | none | 36 | 14 |

The blank stretches are contiguous and also occur with the module absent from the screen. It is therefore not evidence of a transaction or chrome-geometry failure here.

## Non-negotiable invariants

1. React Native owns the gesture and child movement.
2. React Native owns fling physics.
3. A parent never calls `scrollBy` or `scrollTo` to execute source movement.
4. A parent never owns a proxy `OverScroller` for the source.
5. Native chrome consumes or observes the real synchronous nested-scroll transaction.
6. No `scrollY` sampling is used as the transport.
7. No navigation-chrome-specific per-frame JS callback is required.
8. `scrollY` remains the source's own coordinate; chrome state is separate.
9. Source/chrome ambiguity fails closed.
10. Material remains the source of truth for Material behavior and terminal snap state.

## Upstream boundary

The work separates cleanly into two responsibilities:

### React Native / the scroll source

Provide a complete Android nested-scrolling child contract for the movement the source already owns, including momentum and correct Parent3 accounting.

### react-native-screens / the screen layer

Provide the native ancestor and explicit screen-scoped registration through which screen chrome can participate in that transaction.

The screen layer should not own the source physics, and React Native should not know about Material3.

## Next steps

1. Keep this 0.83 implementation as the measured baseline.
2. Preserve the transaction ledger as debug/stress instrumentation.
3. Replace prototype tree scanning with explicit source registration in the upstream-oriented shape.
4. Move chrome geometry ownership out of the internal ReactScrollView content child when the screen layer can own that container.
5. Use the 0.83 touch and momentum limitations as source-level evidence rather than adding more intelligence to the parent.
