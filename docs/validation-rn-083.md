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

The test pass covered:

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

For React Native 0.83, the parent-side architecture is considered validated when the source provides the required callbacks:

```text
single physics       yes
single movement owner yes
parent proxy fling    no
scrollY sampling      no
parent child scroll   no
true pre/child/post   yes
transaction drift     0 / 566 measured frames
```

Remaining correctness gaps are source-contract limitations of the 0.83 `android.widget.ScrollView` path, plus prototype plumbing such as source discovery and standalone-module chrome geometry ownership.
