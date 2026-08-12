# React Native 0.83 native-scroll validation baseline

This document records the measured baseline for the source-owned nested-scroll architecture on React Native 0.83.

It is intentionally a validation record, not a design document. The current design and invariants live in `ARCHITECTURE.md`.

## Configuration

The tested architecture keeps the React Native scroll source in ownership of all movement:

- touch is executed by the source's normal `android.widget.ScrollView` path;
- momentum is executed by React Native's own `OverScroller`;
- the 0.83 source patch only reports momentum through `TYPE_NON_TOUCH` nested scrolling;
- `ExpoNestedScrollHostView` is a `NestedScrollingParent3` and never moves the source;
- TopAppBar may consume pre/post distance;
- FloatingToolbar observes real child-consumed distance in post-scroll.

The transaction ledger verifies, per accounted frame:

```text
requested = chromePre + childConsumed + chromePost + remaining
```

## Stress matrix

The measured pass covered:

- slow drag;
- hard fling;
- direction reversal;
- top edge;
- bottom edge;
- a new touch interrupting momentum;
- TopAppBar alone;
- TopAppBar plus FloatingToolbar;
- React Native ScrollView and FlashList sources.

Measured results:

| Screen | Source | Chrome | Accounted frames | Broken frames |
|---|---|---|---:|---:|
| Feed | FlashList | small `enterAlways` | 177 | 0 |
| Profile | RN ScrollView | large `exitUntilCollapsed` | 251 | 0 |
| Gallery | FlashList | large `exitUntilCollapsed` | 138 | 0 |
| **Total** | | | **566** | **0** |

No accounted frame violated transaction conservation.

## Collapse-limit handoff

The important upward handoff is visible when a large input delta crosses the TopAppBar collapse endpoint.

The app bar consumes only the distance its state can actually move. The remainder stays available to the React Native source rather than being deleted by Material's reported consumption.

This is the required behavior:

```text
requested
  = actual chrome movement
  + real child movement
  + post consumption
  + remaining
```

The parent does not split the child phase manually and does not call `scrollBy` on the source.

## Top-edge expansion

A measured reverse-scroll sequence at the top edge was:

```text
requested=-48 -> child=-47, chrome=-1
requested=-26 -> child=0,   chrome=-26
```

The first frame exhausts the remaining child range and gives one pixel to the app bar. On the next frame the list is already at its start, so the whole delta is post-scroll available distance and Material expands by 26 pixels.

This proves that the parent receives enough real transaction information to run `exitUntilCollapsed` without sampling or a touch-distance reconstruction channel.

## React Native 0.83 touch limitation

The same top-edge test isolates a limitation below the parent.

React Native 0.83 uses `android.widget.ScrollView`. During touch, platform ScrollView dispatches post-scroll through the legacy nested-scroll callback that does not return the `NestedScrollingParent3 consumed[]` result to the source.

Therefore, on this frame:

```text
requested=-26
child=0
parent post-consumes=-26
```

the parent has behaved correctly, but the legacy source cannot subtract those 26 parent-consumed pixels before its own overscroll/stretch decision.

This is not repairable by adding intelligence to `ExpoNestedScrollHostView`: the relevant touch loop belongs to `android.widget.ScrollView`.

AndroidX `NestedScrollView` owns that loop and supports Parent3 post-consumption accounting. This is one reason the long-term source solution belongs in React Native rather than in the screen ancestor.

## React Native 0.83 momentum limitation

Stock `ReactScrollView` also owns its fling without emitting the `OverScroller` movement as per-frame `TYPE_NON_TOUCH` nested-scroll callbacks.

The prototype patch in `docs/upstream/react-scroll-view-momentum-nested-scroll.patch` keeps the original source physics and reports each real movement as:

```text
pre-scroll -> source child movement -> post-scroll
```

The parent does not take over the fling.

This is the second source-side limitation demonstrated by the PoC.

Together, the touch and momentum findings define the upstream boundary:

```text
source responsibility:
  provide the complete nested-scrolling child transaction
  for every movement the source owns

screen responsibility:
  participate in that transaction and coordinate native chrome
```

## FlashList hard-fling blank window

A visible blank content window under violent FlashList fling was measured frame by frame with screen recording.

Initial runs had suggested React Native's scroll-away padding primitive might be responsible. A control with the app bar removed disproved that attribution.

| Run | Module geometry | Video frames | Blank frames |
|---|---|---:|---:|
| App bar present | scroll-away padding + translation | 38 | 12 |
| App bar absent | none | 36 | 14 |

The blank frames occur in contiguous runs, not only as isolated single-frame flashes.

Because the control reproduces the same failure with no module geometry in the screen, the blank render window is not counted as a transport/chrome regression in this baseline.

## Baseline conclusion

For the measured React Native 0.83 baseline, the parent-side architecture is validated when the source provides the required callbacks:

```text
single physics        yes
single movement owner yes
parent proxy fling    no
scrollY sampling      no
parent child scroll   no
true pre/child/post   yes
transaction drift     0 / 566 measured frames
```

The remaining correctness gaps demonstrated by that run are source-contract limitations of the 0.83 `android.widget.ScrollView` path, plus prototype plumbing such as standalone-module chrome geometry ownership.

## Changes after the measured baseline

The transaction algorithm itself has not been changed since the `0 / 566` run, but the current branch contains two behavioral cleanups that still need a device regression pass before the same measurement can be attributed to HEAD.

### Layout-driven source preparation

The fixed `32 / 250 / 750 ms` source-discovery retries were removed. The host now:

1. checks for the native ReactScrollView in a posted turn;
2. if Fabric/FlashList has not mounted it yet, waits on `OnGlobalLayoutListener`;
3. removes the listener as soon as one source is available;
4. treats multiple ReactScrollViews as ambiguous for pre-gesture geometry;
5. never writes transaction-active source/chrome state during discovery.

Regression checks:

- first visible frame has correct TopAppBar inset on RN ScrollView;
- first visible frame has correct TopAppBar inset on FlashList;
- no first-gesture geometry jump;
- source replacement/remount rebinds;
- changing TopAppBar variant/insets re-prepares geometry;
- logs show `SOURCE_WAIT` listener removed after mount rather than remaining armed.

### FloatingToolbar drift workaround removed

The old `ChromeSettlePolicy.shouldRestoreAtTop(...)` correction was deleted. That policy existed because the previous sampled/proxy transport could lose deltas after a session closed. With source-owned pre/child/post delivery, keeping the repair would make the toolbar diverge from Material based on an error source that no longer exists.

The toolbar now always lets Material perform its terminal snap from the offset it actually observed, with zero velocity for the same reason as before: fling distance has already been delivered frame by frame.

Regression checks:

- TopAppBar + FloatingToolbar repeated collapse/expand cycles;
- toolbar endpoint after a partial reverse scroll that reaches list top;
- interrupt a toolbar settle with a new touch;
- compare toolbar endpoint/motion with the repository's pure Compose reference screen;
- transaction ledger remains at zero broken frames throughout.

### React Native patch default semantics

The 0.83 momentum patch now initializes its `NestedScrollingChildHelper` from the platform's existing nested-scroll state instead of forcing it enabled in every ReactScrollView. The host still enables nested scrolling explicitly for its source, so the PoC path should be unchanged.

Regression checks:

- source under `NativeScrollHost` still opens TOUCH and NON_TOUCH nested sessions;
- an unrelated ReactScrollView outside the host keeps normal React Native `nestedScrollEnabled` default behavior.

## Current HEAD partial revalidation — Gallery

A new Gallery run was captured on the post-cleanup HEAD with FlashList, large `exitUntilCollapsed` TopAppBar and the shared FloatingToolbar.

The raw trace contains a synthetic emulator/trackpad torture sequence. Those sessions repeatedly saturate the reported fling velocity at exactly `+/-21000 px/s` and can occur only a few milliseconds apart. They came from two-finger host-trackpad scrolling and are not counted as representative finger gestures for the acceptance sample.

Android still reports those emulator events as `pointers=1`; this is therefore not application-level multi-touch. The distinction is about the input generator, not about a different nested-scroll contract.

Results after excluding every session whose fling saturated at `abs(vy) == 21000`:

```text
representative ledger frames  627
broken ledger frames            0
balanced=false                  0
```

The raw trace, including the synthetic torture sessions, also contains no broken transaction. Those sessions are retained only as extra robustness evidence rather than included in the representative sample.

Source preparation on this run took the immediate path:

- one ReactScrollView source was found;
- nested scrolling was enabled on that source;
- TopAppBar and FloatingToolbar both resolved to it;
- no `ambiguousReactSources` line occurred;
- no `SOURCE_WAIT` line occurred because the source was already present when preparation ran.

The absence of `SOURCE_WAIT` is valid for the immediate path but does not exercise the delayed `OnGlobalLayoutListener` fallback yet.

The accompanying 28.336 s Gallery screen recording was also scanned frame by frame. Across 1018 decoded video frames, the list-content region never approached the previous blank-window threshold; the minimum measured purple-content occupancy was about 83.6%, with no blank frames detected in this recording.

Completed FloatingToolbar settles in the full trace always ended at a Material endpoint: either `offset=0` or `offset=offsetLimit`. No completed settle ended at an intermediate toolbar offset.

This is enough to mark **Gallery transaction + toolbar settle + immediate source preparation** as revalidated on current HEAD. It is not enough to mark the whole branch revalidated, because the RN ScrollView / Feed paths and the delayed source-mount fallback still need their own pass.

## HEAD acceptance gate

Do not promote the current branch from “measured baseline + reviewed cleanups” to “fully revalidated” until the remaining regression checks pass on device.

The acceptance condition remains:

```text
0 broken ledger frames
+ no first-gesture geometry jump
+ Material-consistent FloatingToolbar settle
+ unchanged unrelated ScrollView behavior
```
