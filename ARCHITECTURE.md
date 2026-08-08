# Native scroll interop architecture

## Goal

Let native navigation chrome participate in Android's scroll the way it does in a real Compose app,
while the scrollable content stays an ordinary React Native `ScrollView` or FlashList. No
chrome-specific `onScroll` handler, no list ref handed to the chrome, no per-frame JavaScript.

## Shape

```text
        transport                    coordinator                  consumers
┌──────────────────────────┐   ┌────────────────────┐   ┌────────────────────────────┐
│ ReactScrollViewTransport │──▶│ NativeScroll       │──▶│ FloatingToolbarScrollConsumer│
│  - discovery             │   │ Coordinator        │   │ TopAppBarScrollConsumer      │
│  - one RN scroll listener│   │  - client registry │   └────────────────────────────┘
│  - Choreographer sampling│◀──│  - eligibility     │                │
│  - phase + velocity      │   │  - fan-out         │                ▼
│  - RnScrollSource        │   └────────────────────┘        Material3 state
│    (ScrollSourceController)│                                (the source of truth)
└──────────────────────────┘
```

Three packages, and the dependency direction is the whole point:

- `com.materialtoolbar.interop` — the contract plus the React Native transport.
- `com.materialtoolbar.consumers` — Material 3 behaviour. Depends on `interop`, on nothing else.
- `com.materialtoolbar.views` / `.rn`, `expo.modules.materialtoolbar` — hosts and bindings.

`InteropBoundaryTest` fails the build if a consumer or the contract ever imports
`com.facebook.react` or `expo.modules`. The one permitted exception is
`ReactScrollViewTransport.kt`, which is the adapter.

## The contract

```kotlin
interface ScrollSourceController {          // write side
  val scrollY: Int
  val isUsable: Boolean
  fun reserveChromeSpace(topInsetPx: Int)
  fun releaseChromeSpace()
  fun scrollToY(y: Int)
}

interface NativeScrollConsumer {            // read side
  fun onScrollSessionStart(controller: ScrollSourceController)
  fun onScrollFrame(frame: NativeScrollFrame)
  fun onScrollSessionEnd(velocityY: Float)
}

data class NativeScrollFrame(
  val deltaY: Int, val scrollY: Int, val rawScrollY: Int,
  val phase: ScrollPhase,                   // Drag | Fling | Programmatic
  val velocityY: Float,
)
```

Two things here are load-bearing and were not obvious at first.

**The contract is bidirectional.** A floating toolbar only observes, but a collapsing app bar
displaces content: its collapse range has to exist inside the source's own scroll range, and the
source has to be repositioned when Material's settle animation lands on an endpoint. Modelling that
as a capability the transport grants (`reserveChromeSpace` / `scrollToY`) is what lets the app-bar
consumer stay free of React Native. Before this existed, it reached for `ReactScrollView` directly.

**Phase is part of the sample.** Compose nested scroll distinguishes finger-driven pixels from
inertial ones. Forwarding a fling as `NestedScrollSource.UserInput` makes Material apply drag-time
policy to momentum, which is a real behavioural difference from a native Compose screen even though
it looks approximately right.

## Session lifecycle

A session is driven by **scroll change**, not by drag events. Drag events only classify the phase.

| event | effect |
| --- | --- |
| `BEGIN_DRAG` | start or reclassify session, phase = `Drag` |
| `SCROLL` with no session | start session, phase = `Programmatic` |
| `END_DRAG` | keep phase `Drag`, record velocity |
| `MOMENTUM_BEGIN` | phase = `Fling`, record velocity |
| `MOMENTUM_END` | phase = `Programmatic` |
| 4 still frames, not dragging | end session, emit velocity |

The `Programmatic` row is the one that matters for correctness rather than polish. A session gated
on `BEGIN_DRAG` never sees a TalkBack `ACTION_SCROLL_FORWARD`, a `scrollTo` from JavaScript, a mouse
wheel, or a D-pad scroll — the content moves and the chrome silently stays where it was.

## Why the app bar can reserve the source's scroll range

`exitUntilCollapsed` collapses while content scrolls up, and expands from post-scroll *available*
distance once the content has reached its top. With `reserveChromeSpace(expandedHeight)`, the
collapse range lives inside the source's own range:

```text
scrollY 0 .............. collapseRange .............. content
        │                      │
        │                      └── app bar fully collapsed, list scrolls normally
        └── app bar fully expanded
```

so `logicalChildY = max(0, scrollY - collapseRange)` is the position a Compose `Scaffold` child
would have had, and the leftover distance in a frame is exactly what Material wants as `available`.

This replaced an earlier design that recovered the missing top-boundary distance from a
non-consuming `OnTouchListener` on the `ReactScrollView`. That observer is gone: once the collapse
range is inside the scroll range, `scrollY == 0` already means "fully expanded", so there is no
missing distance to recover. Removing it also removed a single-slot `setOnTouchListener` that would
clobber any listener React Native or a gesture library had installed.

## Re-entrancy

A consumer that calls `scrollToY` during a Material settle causes React Native to emit a scroll
event, which the sampler would otherwise read back as a user delta and forward to the same consumer
— a loop where the app bar and the list chase each other. `RnScrollSource.scrollToY` therefore
re-baselines the session's last sampled position, so a self-driven move produces a zero delta.

## Invariants

1. No chrome-specific JavaScript `onScroll` handler, and no list ref reaches a consumer.
2. Sampling and Material state updates stay on the Android UI thread.
3. Consumers receive a controller and frames — never a `View`.
4. A source only drives chrome that is attached, shown, and on the same surface.
5. Normalized deltas never contain Android edge-bounce pixels.
6. Material 3 remains the source of truth for app-bar and toolbar state, snapping and settling.
7. Every kind of scroll produces a session, including accessibility and programmatic scrolls.

## Known gaps

These are stated rather than hidden, because the interesting question upstream is where the model
breaks, not where it works.

- **Source discovery is a heuristic**: the largest visible vertical `ReactScrollView` on the owner's
  surface. Nested vertical scrollers resolve to the outer one. Ownership should eventually be
  per-screen, which is precisely what a `react-native-screens` transport would provide.
- **Velocity sign** is derived from the transport and negated to match Compose's axis. It has not
  been calibrated against a real Compose app yet.
- **`maintainVisibleContentPosition`**, custom `renderScrollComponent` that is not a
  `ReactScrollView`, horizontal and inverted lists: unsupported, untested, or both.
- `setScrollAwayTopPaddingEnabledUnstable` is an unstable React Native primitive. It is confined to
  `RnScrollSource` so that an upstream transport can satisfy `reserveChromeSpace` differently.
