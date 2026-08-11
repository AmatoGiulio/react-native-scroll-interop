# RFC — A native scroll transport for Android chrome in react-native-screens

**Status:** draft for discussion
**Target:** `react-native-screens` (Android)
**Author:** Giulio Amato
**Proof of concept:** `expo-material-toolbar` (this repository)

## Summary

Android chrome that reacts to scrolling — collapsing top app bars, floating toolbars — needs to
receive the scroll of the list it belongs to. On Android that channel is nested scrolling, and
`react-native-screens` already uses it: `ScreensCoordinatorLayout` + `CustomAppBarLayout` +
`AppBarLayout.ScrollingViewBehavior`.

That path is limited to the **View-based** Material Components stack. Everything Material 3
Expressive added — large/medium top app bars with the current motion, the floating toolbar,
`exitUntilCollapsed` / `exitAlways` scroll behaviors — ships **only in Compose**, and Compose has no
way to observe a `ReactScrollView`.

This RFC proposes that `react-native-screens` own a small, chrome-agnostic **scroll transport**: a
nested-scrolling ancestor inside the RN view tree, plus a registration contract that any native
consumer can attach to. It is not a Material API and does not commit screens to Compose. It is the
missing primitive that makes any of it possible.

We built and shipped this transport in a standalone module to find out whether it works. It does.
This RFC reports what we learned, including the parts that were not obvious.

## The problem, concretely

To drive a Compose `TopAppBarScrollBehavior` or `FloatingToolbarScrollBehavior` you must feed it
nested-scroll callbacks. Those behaviors *are* `NestedScrollConnection`s: in a pure Compose app you
write `Modifier.nestedScroll(behavior)` on an ancestor of a `LazyColumn` and the framework does the
rest.

In React Native the scrolling view is a `ReactScrollView`, an Android `View`. It emits nested-scroll
callbacks to its **native ancestors**, and nothing in the RN tree listens.

The options an app author has today are all bad:

| approach | why it fails |
|---|---|
| `onScroll` to JS, then drive chrome from JS | one JS round-trip per frame; chrome lags the finger visibly and drops frames under load |
| Animated `useNativeDriver` scroll value | drives properties, not a Material scroll behavior; the behavior's own physics, snap and collapse thresholds are unreachable |
| reimplement the chrome | you are no longer shipping Material; every OS release drifts |

## What we found

### 1. A `NestedScrollingParent3` inside the RN tree just works

If a `ViewGroup` implementing `NestedScrollingParent3` is a **real Android ancestor** of the
`ReactScrollView`, the scroll view dialogues with it natively: `onStartNestedScroll`,
`onNestedPreScroll`, `onNestedScroll`, `onNestedPreFling`. No patch to React Native, no JS
involvement, no ref handed anywhere, no `onScroll` prop.

This is the whole finding, and it is small. In our proof of concept the ancestor is an explicit
component the app author wraps around the list. **In screens it does not have to be**:
`ScreenContentWrapper` is already a `ReactViewGroup` that wraps the screen's children and is already
an ancestor of whatever list the screen renders. Making it a nested-scrolling parent puts the
transport in place for every screen, with no new public API and no change to app code.

### 2. Chrome must be driven inside the same frame, as one transaction

Observing the scroll and then moving the chrome is not enough. Material's pre-scroll phase decides
how much of the delta the chrome consumes, and the list must only scroll by the remainder. Splitting
those two across frames makes the chrome trail the content by a frame — small, but the kind of
mismatch that reads as "not native".

Our driver runs both phases synchronously in `onNestedPreScroll`: Material pre-scroll, then the
child's scroll with what is left, then Material post-scroll. The whole platform delta is then
claimed, so the source does not scroll a second time. The handover at the collapse limit is exact:

```
TX_FRAME dy=10 preReq=6 preChrome=6/6 childReq=4 child=4 → collapse=168.0 logicalY=4
```

Ten pixels split six to the chrome and four to the list, on the frame where the app bar reaches its
limit. No jump, no lost pixel.

### 3. Parent-owned momentum is required, and is where the bodies are buried

`ReactScrollView`'s own fling does not emit per-frame nested-scroll callbacks, so a fling would move
the list while the chrome stood still. The parent has to intercept `onNestedPreFling` and drive the
momentum itself with an `OverScroller`, feeding every frame through the same transaction driver.

That works, and it is also the single most dangerous piece. Anyone implementing this should know:

- **Intercepting the fling makes the source re-open a nested session**, which naively reads as a new
  gesture. Cancelling the proxy there makes the source retry, and the two spin a start/cancel loop
  at frame rate. In our first implementation this froze the UI for over a second: 305 proxy flings
  created, 7 completed. The guard that fixed it is principled rather than ad hoc — *a velocity needs
  at least two scroll samples to exist*, so a session with fewer than two is not a gesture. That one
  rule also covers synthetic input such as a mouse wheel or trackpad, where every notch arrives as a
  complete one-frame DOWN/UP gesture with a saturated velocity.
- **The source must still emit `onMomentumScrollBegin`/`End` to JS.** Ours does — verified: 20 ms and
  84 ms after the proxy's start and end on a 148-frame fling — but it is a contract an app can
  observe, and a transport that breaks it is not a drop-in.
- **Clamp to `scaledMaximumFlingVelocity`.** RN's tracker can report past the platform ceiling, and
  the source's own fling would have been clamped.

### 4. Scroll-away padding and `heightOffset` are not the same thing

Worth stating because it surprised us. A Compose `TopAppBarScrollBehavior` collapses by changing the
app bar's **own height**; the list never scrolls. A padding-based approach — top padding on the
scroll view that scrolls away as the bar collapses — really does scroll the view.

Both are legitimate, but they are visibly different systems, and any consumer that integrates
deltas (a floating toolbar tracking content) will see up to a full app-bar height of movement in one
and none in the other. If screens adopts a transport, it should say which coordinate consumers
receive, because the choice is observable.

## Proposed shape

Nothing here is Material-specific.

```kotlin
// react-native-screens
interface ScreenScrollConsumer {
    fun onScrollSessionStart(source: ViewGroup)
    fun onScrollFrame(frame: ScreenScrollFrame)
    fun onScrollSessionEnd(velocityY: Float)
}

data class ScreenScrollFrame(
    val deltaY: Int,
    val scrollY: Int,
    val rawScrollY: Int,
)
```

- `ScreenContentWrapper` implements `NestedScrollingParent3` and becomes the transport.
- Consumers register against the screen, not against a scroll view: the screen already knows which
  content is its own, which is exactly the ambiguity an app-level API cannot resolve.
- Resolution is fail-closed. In our implementation exactly one eligible consumer on the same Fabric
  surface may participate; we never guess "the largest visible ScrollView" or pick a source
  heuristically. This matters more than it sounds — it is the difference between a primitive and a
  source of bug reports.

With that in place, a Compose top app bar or floating toolbar becomes an ordinary consumer, and so
does anything else: a native search bar, a bottom bar, a scroll-linked FAB.

## What this is not

- **Not a Compose dependency for screens.** The transport is plain Android nested scrolling. A
  consumer may be Compose; the transport does not care and does not link against it.
- **Not a replacement for `AppBarLayout`.** The existing `CoordinatorLayout` path keeps working and
  remains the right answer for View-based chrome. This adds a channel for consumers that
  `CoordinatorLayout` cannot host.
- **Not a JS API.** No new props, no refs, no `onScroll`. If it needs app code, we got it wrong.

## Evidence

Measured on the proof of concept, Android emulator, `androidx.compose.material3:1.5.0-alpha17`:

- Chrome tracks the finger with no visible lag; the collapse-limit handover is pixel-exact.
- 148-frame proxy fling, continuous, with `onMomentumScrollBegin`/`End` reaching JS.
- Fling lifecycle after the guards: 3 starts, 3 completions, zero cancelled-before-first-frame,
  against 305/7 before them.
- Time from the end of movement to the start of the chrome settle: 83–96 ms (inactivity timeout)
  down to ~34 ms (explicit terminal signal from the transport).

One finding is worth reporting because it will save someone the same investigation: the step some
users notice in the floating toolbar's travel is **Material's own**, not the transport's.
`settleFloatingToolbar` runs a decay and then a snap, and the snap builds its `AnimationState` with
`initialVelocity = 0f` hardcoded, so velocity passes through zero between the two phases. A pure
Compose reference screen — `LazyColumn` + `LargeTopAppBar(exitUntilCollapsed)` +
`HorizontalFloatingToolbar(exitAlways)`, no React Native — reproduces it.

## Open questions

1. **Where should registration live?** `ScreenContentWrapper` is the natural transport, but the
   consumer is usually chrome owned by the fragment (`ScreenStackFragment`). Registering through the
   screen keeps the coupling honest; is that the shape screens would want?
2. **Which coordinate do consumers receive** — raw source scroll, or a content coordinate normalized
   for chrome that scrolls the view itself? See §4.
3. **Should the transport own momentum at all**, or should it be opt-in per consumer? Owning it is
   required for chrome that must move during a fling, and it is also the riskiest part.
4. **Edge effects.** Our implementation currently swallows the remainder at the boundaries, so there
   is no stretch/glow while chrome is involved. A transport that upstreams should hand the remainder
   back.
5. **iOS.** This RFC is Android-only. The equivalent problem exists on iOS with `UIScrollView` and
   `UINavigationBar`, and the answer is not symmetric.

## Prior art

- `AppBarLayout` + `CoordinatorLayout`, which screens already uses — the same idea, restricted to
  View-based chrome and to consumers a `CoordinatorLayout` can host.
- `BottomSheetBehavior` on `Screen`, which shows screens already hosting a Material behavior whose
  input is a gesture on RN content — the same shape of coupling this RFC asks for, for scrolling.

## Reference implementation

`expo-material-toolbar` in this repository. The transport is deliberately separate from the Material
consumers (`NativeScrollInterop.kt` knows nothing about `TopAppBarScrollConsumer` or
`FloatingToolbarScrollConsumer`), so the part being proposed here can be read on its own.

The nested-scrolling ancestor is currently an explicit component the app wraps around its list —
appropriate for a proof of concept, and the thing this RFC proposes to remove by moving it into the
screen.
