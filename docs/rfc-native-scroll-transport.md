# RFC — Let native screen chrome participate in React Native scroll transactions on Android

**Status:** draft for discussion  
**Target:** `react-native-screens` (Android)  
**Author:** Giulio Amato  
**Reference implementation:** `expo-material-toolbar` (this repository)

## Summary

Android already has the protocol needed for native screen chrome to follow a React Native scroll: nested scrolling.

The missing screen-level piece is an ancestor that receives the source's real nested-scroll transaction and lets native chrome participate in it. In a standalone module that ancestor has to be an explicit wrapper. In `react-native-screens`, the screen layer already owns the right place in the native hierarchy.

The proposal is deliberately small:

- React Native remains the owner of touch, fling, physics and child movement.
- The screen becomes a `NestedScrollingParent3` participant/dispatcher.
- Native chrome consumes or observes the source's synchronous pre/post scroll callbacks.
- There is no JS `onScroll`, no list ref, no sampled `scrollY`, no proxy fling and no second scroller.

The reference implementation currently drives real Compose Material3 `TopAppBarScrollBehavior` and `FloatingToolbarScrollBehavior`, but Material3 is only a consumer proving the transport. The transport itself is plain Android nested scrolling and should not add a Compose dependency to screens.

## Why the screen layer is the right owner

A scroll-reactive header is screen chrome. The screen already knows:

- which native content belongs to it;
- which header/toolbar belongs to it;
- when that content is attached and visible;
- the native scope in which source and chrome must be paired.

An app-level module cannot know those things without tree scanning or heuristics. Our standalone implementation therefore has to discover descendants and resolve consumers by native/Fabric scope. That works as a PoC, but it is plumbing the screen layer can avoid entirely.

The desired native shape is:

```text
Screen / screen content wrapper
  NestedScrollingParent3
        |
        +-- registered scroll source
        +-- registered screen chrome consumer(s)
```

No public React API is necessarily required for the transport itself.

## The transaction

For one vertical input delta:

```text
React Native source requests dy
        |
        v
screen onNestedPreScroll
  chrome may consume part of dy
        |
        v
React Native source scrolls the remainder itself
        |
        v
screen onNestedScroll
  receives actual dyConsumed + dyUnconsumed
  chrome may consume post-scroll available distance
        |
        v
only the true remainder reaches source edge behavior
```

The accounting invariant is:

```text
requested = preConsumed + childConsumed + postConsumed + remaining
```

This matters more than any particular component implementation. If the parent executes child movement itself, samples a previous position, or carries debt from the previous frame, there are two drivers or two timelines and the result stops behaving like native nested scrolling.

The reference implementation now checks this equation on every traced frame.

## What the reference implementation proved

The current 0.83 PoC was stressed across slow drag, hard fling, direction reversal, top edge, bottom edge and touch interruption of momentum:

| Screen | Source | Chrome | Accounted frames | Broken |
|---|---|---|---:|---:|
| Feed | FlashList | small `enterAlways` | 177 | 0 |
| Profile | RN ScrollView | large `exitUntilCollapsed` | 251 | 0 |
| Gallery | FlashList | large `exitUntilCollapsed` | 138 | 0 |

Total: 566 accounted frames, zero transaction violations.

A measured top-edge sequence also shows the handoff expected from a real nested-scroll chain:

```text
requested=-48 -> child=-47, chrome=-1
requested=-26 -> child=0,   chrome=-26
```

The first frame reaches the list's start edge. The second frame is entirely available to the expanding app bar.

## The important source-side boundary

The parent can only be correct if the source implements the Android nested-scrolling child contract for the movement it owns.

React Native 0.83 uses `android.widget.ScrollView`. Two source-side limitations are observable.

### 1. Momentum visibility

`android.widget.ScrollView` performs its fling from its own `OverScroller` / `computeScroll()` path without emitting the movement as per-frame `TYPE_NON_TOUCH` nested-scroll transactions to the ancestor.

The correct fix is not for the screen to reproduce the fling. The correct fix is for the source to report the fling it is already performing.

The reference patch under `docs/upstream/` does exactly that: it keeps React Native's own `OverScroller` and wraps each real momentum movement in pre/child/post nested scrolling.

This is source responsibility. A screen layer should never estimate velocity and run a proxy `OverScroller` for the child.

### 2. Parent3 post-consumption during touch

The legacy `android.widget.ScrollView` touch loop dispatches post-scroll through the older contract that does not return the `NestedScrollingParent3 consumed[]` result to the source.

At the top edge, a parent can correctly consume post-scroll distance to expand chrome, but the platform ScrollView cannot subtract that parent consumption before deciding what remains for its own overscroll/stretch behavior.

Again, the parent cannot repair this without replacing the child's touch loop. A source backed by AndroidX `NestedScrollView` owns that loop and can account for Parent3 post-consumption correctly.

These findings are useful because they define the boundary cleanly:

> The screen should participate in the transaction. The source should provide the transaction for all movement it owns.

## Relationship to React Native's existing work

This proposal builds on the same direction already explored in React Native by:

- facebook/react-native#44099
- facebook/react-native#55239

The latter introduced the `useNestedScrollViewAndroid` path, where the vertical React Native scroll view can be backed by AndroidX `NestedScrollView`.

That work and this proposal are complementary:

```text
React Native / source
  complete nested-scrolling child behavior
             |
             v
react-native-screens / screen
  nested-scrolling ancestor + chrome registration
```

We are not proposing an alternative source physics implementation in screens.

## Consumer contract

The screen-side contract should be free of Material and should preserve Android's phases rather than flattening them into sampled frames.

One possible shape is:

```kotlin
interface ScreenScrollConsumer {
    fun onScrollSessionStart(source: View)

    fun onNestedPreScroll(
        source: View,
        dy: Int,
        type: Int,
    ): Int

    fun onNestedPostScroll(
        source: View,
        dyConsumed: Int,
        dyUnconsumed: Int,
        type: Int,
    ): Int

    fun onScrollSessionEnd(source: View)
}
```

The exact API is not the point. The important properties are:

1. pre and post remain synchronous phases of the same transaction;
2. the parent only reports what it consumes;
3. the child performs its own movement;
4. post receives what the child actually consumed;
5. the contract supports `TYPE_TOUCH` and `TYPE_NON_TOUCH`;
6. consumer lookup is screen-scoped and fail-closed.

A consumer that only observes movement, such as the reference FloatingToolbar, can return zero consumption.

## Material3 as a proof consumer

### TopAppBar

A Compose Material3 TopAppBar maps naturally onto nested scrolling:

- `onPreScroll` may consume distance before the list moves;
- `onPostScroll` sees the list's real consumed/unconsumed result;
- terminal Material snap runs after the movement actually ends.

The current adapter limits pre-consumption to the amount the chrome state really moved at its clamp. This avoids deleting input when Material reports the whole available delta while its `heightOffset` has already reached an endpoint.

### FloatingToolbar

The FloatingToolbar reacts to the source's real `dyConsumed` in post-scroll and consumes zero list distance.

When the TopAppBar consumes an entire frame in pre-scroll, `dyConsumed == 0` for the list. The toolbar therefore sees zero, which matches the phase semantics of a native Compose nested-scroll chain rather than a reconstructed content-delta stream.

## Geometry is separate from transaction transport

The standalone module still has to solve one unrelated problem: a full-screen overlay TopAppBar needs its React Native content visually positioned below the expanded chrome.

The current PoC uses React Native's scroll-away padding primitive plus a native content translation driven by Material collapse state. Crucially, that translation does not change `scrollY` and does not execute source movement.

That geometry bridge is not what we are asking screens to adopt. A screen-owned implementation has a better option: own the content/chrome container geometry itself.

Transport and geometry should remain separate concerns.

## What we explicitly reject

The reference implementation tried several approaches before converging on the nested transaction. These should not be part of the upstream design:

- JS `onScroll` as the native chrome transport;
- display-frame sampling of `scrollY`;
- reconstructing deltas from positions;
- a parent-owned fling or proxy `OverScroller`;
- the parent calling `scrollBy` / `scrollTo` to execute child movement;
- encoding chrome collapse into the source's `scrollY`;
- heuristically choosing a scroll source from unrelated visible views.

They all create either a second physics, a second driver, or a second timeline.

## FlashList stress result

A transient blank FlashList render window was initially suspected to be caused by the scroll-away geometry. Frame-by-frame control recordings disproved that attribution:

| Run | Our geometry | Frames | Blank frames |
|---|---|---:|---:|
| App bar present | padding + translation | 38 | 12 |
| App bar removed | none | 36 | 14 |

The blank window also occurs without this module in the screen. It is therefore not evidence against the nested-scroll transaction or a reason to alter the screen transport.

## What we are asking from react-native-screens

We are not asking screens to implement Material3 behavior.

We are asking whether the screen layer can expose/host the native Android nested-scroll relationship already implied by its ownership of screen content and chrome:

1. make the appropriate screen/content wrapper a `NestedScrollingParent3` ancestor;
2. register scroll-reactive native chrome against that screen;
3. forward the real pre/post transaction without driving the child;
4. support both touch and non-touch transactions when the source provides them;
5. keep the transport independent of Compose/Material.

That would make consumers such as Compose Material3 chrome possible without app-level wrappers, refs or JS scroll callbacks.

## Open questions

1. Should the nested parent live on `ScreenContentWrapper`, `Screen`, or another existing screen-owned ViewGroup?
2. What is the best existing screens concept for identifying the active source — `ScrollViewMarker`, screen content ownership, or a smaller internal registration contract?
3. Should multiple consumers participate in ordered phases, or should screens expose one screen-scroll coordinator that fans out internally?
4. How should legacy `android.widget.ScrollView` limitations be surfaced while React Native's `NestedScrollView` path is not universal?
5. What is the corresponding iOS architecture? This RFC is intentionally Android-only.

## Reference implementation boundary

The useful files in this repository are now deliberately split by responsibility:

- `ExpoNestedScrollHostView.kt` — prototype `NestedScrollingParent3` screen ancestor and transaction ledger;
- `NativeNestedScrollInterop.kt` — screen-scoped source/chrome registry and small transaction result types;
- `TopAppBarScrollConsumer.kt` — Material3 TopAppBar consumer plus standalone-module geometry bridge;
- `FloatingToolbarScrollConsumer.kt` — Material3 post-scroll consumer;
- `docs/upstream/react-scroll-view-momentum-nested-scroll.patch` — source-side React Native 0.83 momentum visibility experiment.

The old sampled transport and parent-owned fling implementation have been removed.

## Bottom line

The architecture is intentionally unremarkable Android:

```text
React Native scrolls
        |
Android nested scrolling reports that movement
        |
Screen receives the transaction
        |
Native chrome participates
```

The source owns scrolling. The screen owns coordination. The chrome owns its behavior.
