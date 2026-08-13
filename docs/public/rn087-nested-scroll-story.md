# One scroll, many native consumers: React Native Android nested scrolling and Material 3

> Draft for public publication. Results described here were reproduced on React Native 0.87.0 on Android on 2026-08-12. The RN source change discussed below is a validated experiment, not an upstreamed fix at the time of writing.

## The problem

A collapsing Material 3 TopAppBar looks simple until the content underneath is a React Native `ScrollView`.

The tempting implementation is to observe `scrollY`, calculate a second offset and animate the native chrome independently. That can look correct during a slow drag. It becomes much harder during momentum, reversals, edge conditions and interrupted flings because two independent systems are trying to describe one physical movement.

The architecture we wanted was stricter:

```text
React Native owns the only scroll physics
        ↓
Android exposes the real synchronous scroll transaction
        ↓
Material chrome consumes or observes that transaction
```

No second `OverScroller`. No parent calling `scrollBy()` on the child. No sampled `scrollY` reconstruction. No JS per-frame bridge.

## What we learned on older React Native

On an RN 0.83 baseline we could make this architecture work, but momentum required a source-side patch. Touch nested scrolling existed, while the RN-owned fling did not naturally continue as an Android `TYPE_NON_TOUCH` nested-scroll transaction.

That experiment established the important invariant: if every frame of the real RN fling reaches a native ancestor synchronously, Material components can participate without owning a second scroll.

The remaining question was whether newer React Native versions had moved closer to that model.

## RN 0.87 contains a different ScrollView path

React Native 0.87.0 includes a feature flag named `useNestedScrollViewAndroid`. When enabled, the vertical ScrollView implementation changes from the legacy `ReactScrollView` to a generated `ReactNestedScrollView` based on `androidx.core.widget.NestedScrollView`.

That was promising because AndroidX `NestedScrollView` already knows how to express both touch and animated scrolling through Android's nested-scroll protocol.

We built a minimal bare RN 0.87 probe with a `NestedScrollingParent3` above the React root and logged the actual native transaction target.

With the flag disabled, the source was the expected legacy class:

```text
ReactScrollView
TOUCH sessions: present
NON_TOUCH sessions: absent
```

With the flag enabled, the source really changed:

```text
ReactNestedScrollView
TOUCH sessions: present
NON_TOUCH sessions: still absent
```

So the feature flag worked, but the behavior we needed was still missing.

## The bug was smaller than expected

The key finding was in the generated `ReactNestedScrollView.fling()` implementation.

The class inherits from AndroidX `NestedScrollView`, but its copied React Native fling override still drives the reflected `OverScroller` directly and invalidates the view. That skips the normal AndroidX `NestedScrollView.fling()` entry point.

That distinction matters because the AndroidX path performs the animated-scroll setup that opens `TYPE_NON_TOUCH`, establishes the scroller baseline and lets `computeScroll()` dispatch the frame-by-frame nested transaction.

In simplified form, stock RN 0.87 looked like this:

```text
RN fling
  ↓
reflected OverScroller.fling(...)
  ↓
postInvalidateOnAnimation()
```

while the AndroidX path is conceptually:

```text
NestedScrollView.fling(...)
  ↓
start TYPE_NON_TOUCH nested scrolling
  ↓
computeScroll()
  ├─ nested pre-scroll
  ├─ child movement
  ├─ nested post-scroll
  └─ stop TYPE_NON_TOUCH
```

## A causal test before changing React Native

Before modifying RN we ran a deliberately narrow diagnostic experiment.

When the parent received the child's existing fling callback, it called only:

```text
startNestedScroll(VERTICAL, TYPE_NON_TOUCH)
```

on the real transaction target.

The parent still consumed zero pixels, owned no scroller and never moved the child.

That single change caused NON_TOUCH frame callbacks to appear during the existing RN fling. This told us that AndroidX's animated frame loop was already capable of producing the transaction; the missing piece was the session entry.

## Building RN 0.87 from source

We then removed the parent shim and built ReactAndroid itself from source.

For the ordinary non-paging `ReactNestedScrollView` fling path, the experiment delegated to AndroidX:

```kotlin
super.fling(correctedVelocityY)
```

The result was decisive. In one representative run:

```text
starts TOUCH / NON_TOUCH   42 / 21
stops  TOUCH / NON_TOUCH   42 / 21
pre    TOUCH / NON_TOUCH   115 / 214
pre-fling / fling          21 / 21
source patch flings        21
```

Every source-patch fling opened a real NON_TOUCH session, and those sessions were balanced.

The parent still owned no physics. React Native remained the source of gesture velocity and scrolling. The difference was that its AndroidX-backed source now exposed the fling through the nested-scroll transaction it already inherited.

## Driving a real Material 3 TopAppBar

The next test replaced the observation-only parent with a real Material3 `LargeTopAppBar` using `exitUntilCollapsedScrollBehavior`.

The Android parent translated between Android nested scrolling and the Material scroll behavior synchronously:

```text
requested delta
  ↓
TopAppBar pre-consumption
  ↓
ReactNestedScrollView consumes what remains
  ↓
TopAppBar post-consumption of remaining distance
```

React Native still owned the ScrollView position. For the visual geometry we used RN 0.87's unstable scroll-away padding primitive, with reflection restricted to that geometry API rather than to per-frame physics.

A representative end-to-end run produced:

```text
Source
ReactNestedScrollView lines 515
source patch flings         7

Nested sessions
starts TOUCH / NON_TOUCH    12 / 7
stops  TOUCH / NON_TOUCH    12 / 7

Material3
movement TOUCH / NON_TOUCH  143 / 14
settle start / end          10 / 10
```

## Accounting for every pixel

We also kept a transaction ledger:

```text
requested = chromePre + childConsumed + chromePost + remaining
```

The first version of the analyzer incorrectly treated every pre-scroll without a subsequent parent post callback as an orphan.

AndroidX has an important detail here. If the parent consumes the entire requested delta in pre-scroll, the child and unconsumed deltas become zero. `NestedScrollingChildHelper` deliberately suppresses an all-zero post dispatch: effectively, "no motion, no dispatch".

After classifying those frames according to the actual AndroidX contract, the same run became:

```text
post-complete frames        183
full-pre TOUCH frames       62
full-pre NON_TOUCH frames   4
complete frames             249
broken complete frames      0
unexpected orphan pre       0
```

That gave us the property we cared about: every observable frame conserved distance, with no second scroll model needed to repair drift.

## Why multiple consumers matter

A TopAppBar is a consuming participant: it may take part of the requested distance before or after the child.

A floating toolbar has a different role. It should not withhold pixels from the list at all. It can observe only the distance the child really consumed in post-scroll and update its own Material state from that movement.

The target architecture therefore becomes:

```text
ReactNestedScrollView
        ↓
one real TOUCH/NON_TOUCH transaction
        ↓
Native Parent3
   ├─ TopAppBar: pre/post consumer
   ├─ FloatingToolbar: child-consumed post observer
   └─ other native chrome consumers
```

The important property is not the number of chrome components. It is that they all participate in the same transaction while React Native remains the only owner of scroll physics.

## What this does not prove yet

The small source change is not automatically an upstream-ready patch.

`ReactNestedScrollView.kt` is generated, so a canonical React Native change belongs in the nested-view generator plus regenerated output. More importantly, entering AndroidX's own `fling()` path can change details of `OverScroller` configuration compared with the copied legacy implementation.

Before calling the source fix production-safe, we still need explicit regression coverage for paging, snap offsets, deceleration rate, edge/overfling behavior, interrupted flings, momentum events and recycled/Fabric views.

The package integration also needs to live on a host stack that officially supports the target RN version; forcing RN 0.87 into an older Expo toolchain only mixes nested-scroll work with unrelated Gradle/Kotlin compatibility problems.

## The broader lesson

The useful abstraction is not "synchronize an animation with React Native scrolling."

It is:

```text
preserve the source's real transaction and let native UI participate in it
```

Once the transaction is correct, multiple pieces of native chrome can behave like native nested-scroll participants without duplicating the underlying physics.

For RN 0.87 the encouraging result is that most of the required machinery is already there. The gap we found is narrow: the generated fling override bypasses an AndroidX entry point that the class otherwise inherits.

That changes the project from inventing a parallel scrolling system into something much more tractable: make React Native expose the transaction it already knows how to run, then keep every consumer on that one source of truth.
