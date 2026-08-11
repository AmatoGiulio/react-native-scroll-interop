# RFC — Letting native chrome follow a React Native scroll on Android

**Status:** draft for discussion
**Target:** `react-native-screens` (Android)
**Author:** Giulio Amato
**Reference implementation:** `expo-material-toolbar` (this repository)

## Summary

React Native is one primitive away from being able to drive Compose Material 3 chrome — collapsing
top app bars, floating toolbars — from an ordinary list, with no `onScroll`, no ref, and no work on
the JS thread. That primitive is a nested-scrolling ancestor inside the RN view tree, and
`react-native-screens` already has the view that should be it.

This proposal builds directly on work that started in this repository's target project:
[#44099](https://github.com/facebook/react-native/pull/44099), *"Fix ScrollView interactions with
Android's CoordinatorLayout"*, opened by a react-native-screens maintainer, and its successor
[#55239](https://github.com/facebook/react-native/pull/55239), merged January 2026, which lets
`ReactScrollView` extend `NestedScrollView` behind `useNestedScrollViewAndroid`. We are not
proposing an alternative to that direction. We are reporting what we found on the other side of it,
having built and shipped the missing piece to see whether it holds up.

## Why this matters now

The Views-based Material Components library — the world of `AppBarLayout` and `CoordinatorLayout`
that screens uses today — [states it plainly](https://github.com/material-components/material-components-android):

> "This means that the Views-based Material Components for Android library (MDC-Android) is now in
> maintenance mode." … "There are no more planned feature releases for Views, so all projects using
> the Views library should begin or continue migrating to Compose."

Everything Material 3 Expressive added — large and medium top app bars with the current motion, the
floating toolbar, `exitUntilCollapsed` and `exitAlways` scroll behaviors — exists only in Compose.
For React Native on Android this is not a styling gap; those components are unreachable, because a
Compose scroll behavior *is* a `NestedScrollConnection` and nothing in the RN view tree speaks to
it.

Worth stating plainly, since it is the practical shape of the gap: in screens 4.23 there is no
scroll flag on the app bar at all — no `SCROLL_FLAG_*`, no `hideOnScroll`. `AppBarLayout` and
`ScrollingViewBehavior` position the content; they do not collapse with it. On Android, the header
does not react to scrolling.

## The proposal, in two layers

They are separable on purpose. The first is small and permanent. The second is larger, and has an
expiry date already visible in React Native's own roadmap.

### Layer 1 — the ancestor (what we are actually asking for)

A `ViewGroup` implementing `NestedScrollingParent3`, sitting above the scroll source in the RN view
tree, receives `onStartNestedScroll` / `onNestedPreScroll` / `onNestedScroll` / `onNestedPreFling`
from a `ReactScrollView` natively. No patch to React Native, no JS involvement.

In our module that ancestor is a component the app wraps around its list — which is a limitation of
being a standalone module, not of the approach. **In screens it does not have to be.**
`ScreenContentWrapper` is already a `ReactViewGroup` wrapping every screen's children, and already
an ancestor of whatever list the screen renders. Making it a nested-scrolling parent puts the
transport everywhere, with no new public API and no change to app code. That is the difference
between a library feature and something that works out of the box, and screens is the only place
where it can be the latter.

Alongside it, a registration contract, deliberately free of Material:

```kotlin
interface ScreenScrollConsumer {
    fun onScrollSessionStart(source: ViewGroup)
    fun onScrollFrame(frame: ScreenScrollFrame)
    fun onScrollSessionEnd()
}

data class ScreenScrollFrame(val deltaY: Int, val scrollY: Int, val rawScrollY: Int)
```

Consumers register against the screen rather than against a scroll view, because the screen already
knows which content is its own — an ambiguity no app-level API can resolve from outside. Resolution
should be fail-closed: in our implementation exactly one eligible consumer per Fabric surface may
participate, and ambiguity resolves to nothing rather than to a heuristic. "Pick the largest visible
ScrollView" is how this kind of code starts producing bug reports nobody can reproduce.

### Layer 2 — momentum ownership (temporary, and we expect to delete it)

`ReactScrollView` extends `android.widget.ScrollView`, which emits no per-frame nested-scroll
callbacks during a fling. Chrome therefore sits still through every momentum scroll unless the
parent takes the fling over and drives it frame by frame.

We measured exactly what this costs, by switching our own implementation off:

```
last touch frame     sourceY=1154    chrome collapse=231
after the fling      scrollY=7131    ← the list
                     sourceY=1154    ← what the transport still believed
```

Six thousand pixels of scrolling that chrome never heard about. With momentum ownership on, the same
gesture drives 93 frames and the transport ends at `sourceY=7255` against the list's `scrollY=7255`
— exact.

**This is also the layer `useNestedScrollViewAndroid` removes.** `NestedScrollView` dispatches
during fling as `TYPE_NON_TOUCH`, so where that flag is on, reproducing the source's physics in the
parent is strictly worse than using the source's own. Our implementation already treats this as
temporary: the mechanism sits behind a switch documented to be turned off when the flag ships.

We would not propose Layer 2 for adoption. We are reporting it because it is required today on every
React Native version currently in users' hands, and because the failure modes we hit are not
obvious. Anyone implementing it will meet them.

## What Layer 2 cost us, so it costs you less

- **Intercepting the fling makes the source re-open a nested session**, which naively reads as a new
  gesture. Cancelling the proxy there makes the source retry, and the two spin a start/cancel loop
  at frame rate: in our first implementation, 305 proxy flings created against 7 completed, with the
  UI frozen for over a second and the accumulated delta then landing in a single 1000px frame. The
  guard that fixed it is principled rather than ad hoc — *a velocity needs at least two scroll
  samples to exist* — and the same rule covers synthetic input, where a mouse wheel or trackpad
  notch arrives as a complete one-frame DOWN/UP gesture carrying a saturated velocity.
- **`onMomentumScrollBegin`/`End` must still reach JS.** Ours do, verified at 20 ms and 84 ms around
  a 148-frame fling. A transport that breaks that contract is not a drop-in.
- **Clamp to `scaledMaximumFlingVelocity`**, because the source's own fling would have been clamped.

## What Layer 1 alone still requires

Two findings that no React Native flag addresses, and that we would expect any implementation to
meet.

**One transaction per frame.** Material's pre-scroll phase decides how much of the delta the chrome
takes, and the child must scroll by the remainder. Run across two frames, chrome trails the content
by one — small, and exactly the kind of mismatch that reads as "not native". Both phases must run
synchronously inside `onNestedPreScroll`. Ours does, and the handover at the collapse limit is
pixel-exact: `dy=10` splitting six to the chrome and four to the list on the frame the app bar
reaches its limit.

**Consumers that integrate deltas need every frame, or an absolute reference.** A Material scroll
behavior accumulates an offset; it never derives one from position. Any frame the transport fails to
deliver is a permanent error, not a moment of lag. We lost frames when the session ended while
chrome was still animating the source — 63 px in one trace, 29 in another — and the drift compounds
until Material picks its snap endpoint from a wrong number, hiding the toolbar while the app bar
sits expanded. Observed fractions sat at 0.46–0.47, a hair from the 0.5 boundary. A transport
should keep the session alive while a consumer reports it is still moving the source.

## What we are not proposing

- **Not a Compose dependency for screens.** The transport is plain Android nested scrolling. A
  consumer may be Compose; the transport neither knows nor links against it.
- **Not a replacement for `AppBarLayout`.** The existing `CoordinatorLayout` path keeps working. This
  adds a channel for consumers a `CoordinatorLayout` cannot host.
- **Not a JS API.** No new props, no refs, no `onScroll`. If it needs app code, it is the wrong
  shape.

## Open questions

1. **Is `ScreenContentWrapper` the right host**, or should the transport sit on `Screen` itself? The
   consumer is usually chrome owned by the fragment, so registration through the screen keeps the
   coupling honest — but this is your architecture, not ours.
2. **Which coordinate should consumers receive?** A Compose `TopAppBarScrollBehavior` collapses by
   changing its own height and never scrolls the list. A scroll-away padding approach really does
   scroll it. Both are legitimate and they are visibly different systems: a consumer that integrates
   deltas sees a full app-bar height of movement in one and none in the other. Whichever a transport
   picks is observable, so it should be chosen rather than inherited.
3. **How long does Layer 2 need to exist?** That depends on when `useNestedScrollViewAndroid` becomes
   the default rather than opt-in — which you will know better than we do.
4. **iOS.** This is Android-only. The equivalent problem exists with `UIScrollView` and
   `UINavigationBar`, and the answer is not symmetric.

## A note on fidelity

Where the module and Material disagree, we changed the module. The one visible artefact worth
naming: the floating toolbar's travel has a step in it, and it is Material's — `settleFloatingToolbar`
runs a decay and then a snap whose `AnimationState` is built with `initialVelocity = 0f`, so velocity
passes through zero between the phases. This repository ships a pure Compose reference screen
(`LazyColumn` + `LargeTopAppBar(exitUntilCollapsed)` + `HorizontalFloatingToolbar(exitAlways)`, no
React Native) that reproduces it. We kept the step. A transport whose output differs from the
component it exposes invites the question of what else it changed quietly.

## Reference implementation

`expo-material-toolbar`, in this repository. The transport is kept separate from the Material
consumers — `NativeScrollInterop.kt` knows nothing about `TopAppBarScrollConsumer` or
`FloatingToolbarScrollConsumer` — so the part being proposed here can be read on its own. The rules
gating momentum ownership and the settle invariants live in `NestedFlingPolicy` and
`ChromeSettlePolicy`, free of Android types and covered by JVM tests named after the regressions
they prevent.

## Prior art

- [#44099](https://github.com/facebook/react-native/pull/44099) and
  [#55239](https://github.com/facebook/react-native/pull/55239) — the same problem approached from
  inside React Native, which is where the fling half of it belongs.
- `AppBarLayout` + `CoordinatorLayout`, which screens uses today: the same idea, restricted to
  View-based chrome and to consumers a `CoordinatorLayout` can host, on a library in maintenance
  mode.
- `BottomSheetBehavior<Screen>` in screens: a Material behavior already hosted by the screen layer
  and driven by a gesture on RN content. This proposal is the same coupling, for scrolling.
