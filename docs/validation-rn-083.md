# React Native 0.83 native-scroll validation

This document records both the original measured baseline and the post-cleanup revalidation of the source-owned nested-scroll architecture on React Native 0.83.

The design and invariants live in `ARCHITECTURE.md`. This file is evidence, not the architecture definition.

## Contract under test

React Native remains the only owner of source movement:

- touch is executed by the source's normal `android.widget.ScrollView` path;
- momentum is executed by React Native's own `OverScroller`;
- the 0.83 source patch only exposes that owned momentum as `TYPE_NON_TOUCH` nested scrolling;
- `ExpoNestedScrollHostView` is a `NestedScrollingParent3` and never moves the source;
- TopAppBar may consume real distance in pre/post;
- FloatingToolbar observes real child-consumed distance in post-scroll.

For every accounted frame the debug ledger checks:

```text
requested = chromePre + childConsumed + chromePost + remaining
```

A frame is broken only when that conservation equation fails. `orphanPre` is diagnostic and is not a failure: the legacy platform ScrollView touch path may omit post-scroll when pre-scroll consumed the whole request.

## Original measured baseline

The first source-owned pass measured:

| Screen | Source | Chrome | Accounted frames | Broken frames |
|---|---|---|---:|---:|
| Feed | FlashList | small `enterAlways` | 177 | 0 |
| Profile | RN ScrollView | large `exitUntilCollapsed` | 251 | 0 |
| Gallery | FlashList | large `exitUntilCollapsed` | 138 | 0 |
| **Total** | | | **566** | **0** |

It covered slow drag, hard fling, direction reversal, top edge, bottom edge and a new touch interrupting momentum.

### Collapse-limit handoff

When a large upward delta crosses the TopAppBar collapse endpoint, the bar consumes only the distance its state can actually move. The remainder stays available to React Native instead of being deleted by Material's reported consumption.

### Top-edge expansion

A measured reverse-scroll sequence was:

```text
requested=-48 -> child=-47, chrome=-1
requested=-26 -> child=0,   chrome=-26
```

The first frame exhausts the remaining child range and gives one pixel to the app bar. On the next frame the list is already at its start, so the whole request is post-scroll available distance and Material expands by 26 pixels.

This demonstrates the real pre/child/post handoff without `scrollY` sampling or a reconstructed boundary channel.

## Cleanup after the baseline

The parent transaction algorithm was kept intact, but three areas were simplified before the new pass:

1. fixed `32 / 250 / 750 ms` source-discovery retries were replaced by immediate preparation plus a temporary `OnGlobalLayoutListener` fallback;
2. pre-gesture discovery stopped writing transaction-active source/chrome state; Android's nested-scroll `target` is the session authority;
3. the old FloatingToolbar transport-drift restore policy was deleted so Material owns the terminal snap from the offset it actually observed.

The 0.83 source patch was also corrected so its `NestedScrollingChildHelper` preserves React Native's existing `nestedScrollEnabled` default rather than silently enabling nested scrolling for every ScrollView.

## Current-head core revalidation

After those cleanups, Gallery, Feed and Profile were exercised again. The current analyzer lives at `scripts/analyze-scroll-log.mjs`.

### Gallery — FlashList + large `exitUntilCollapsed` + FloatingToolbar

The raw Gallery trace included an emulator/trackpad torture sequence whose fling velocity repeatedly saturated at exactly `+/-21000 px/s`. Android still reported those generated events as `pointers=1`; they were kept as extra stress evidence but excluded from the representative sample because the operator identified them as two-finger host-trackpad artifacts.

Representative result:

```text
ledger frames       627
broken                0
balanced=false        0
```

The full raw trace, including the synthetic torture sequence, also contained no broken transaction.

Source preparation took the immediate path: one ReactScrollView was found, nested scrolling was enabled, both chrome consumers resolved, and no `ambiguousReactSources` line occurred.

The accompanying 28.336 s screen recording was scanned across 1018 decoded frames. The list-content region never approached the previous blank-window threshold; no blank frame was detected in that recording.

Completed FloatingToolbar settles ended at a Material endpoint.

### Feed — FlashList + small `enterAlways` + FloatingToolbar

Measured analyzer result:

```text
gestures                  22
saturated candidates       0
max pointers               1
max representative |vy| 11452 px/s

ledger frames             529
  touch                    172
  non-touch                357
unbalanced                   0
max broken counter           0

FloatingToolbar settles    22 total / 21 completed / 1 canceled
completed non-endpoint       0
TopAppBar settles           22 total / 22 completed
completed non-endpoint       0
```

All four analyzer gates passed.

### Profile — RN ScrollView + large `exitUntilCollapsed` + FloatingToolbar

Measured analyzer result:

```text
gestures                  21
saturated candidates       0
max pointers               1
max representative |vy|  5364 px/s

ledger frames             369
  touch                    164
  non-touch                205
unbalanced                   0
max broken counter           0

FloatingToolbar settles    20 total / 20 completed
completed non-endpoint       0
TopAppBar settles           20 total / 20 completed
```

The first version of the analyzer reported one TopAppBar warning because it required the final expanded offset to be within exactly one physical pixel of zero.

The actual line was:

```text
heightOffset=-1.5293274
limit=-230.52933
fraction=0.006633982
```

That is not a transport drift. Material3's own `settleAppBar()` treats `collapsedFraction < 0.01` as already expanded and returns without running another snap. The analyzer now mirrors that Material semantic instead of imposing a stricter one-pixel rule.

With the Material rule applied, Profile passes the TopAppBar settle check as well.

## Revalidated core matrix

Representative post-cleanup accounting is therefore:

| Screen | Source | Behavior | Frames | Broken |
|---|---|---|---:|---:|
| Gallery | FlashList | large `exitUntilCollapsed` | 627 | 0 |
| Feed | FlashList | small `enterAlways` | 529 | 0 |
| Profile | RN ScrollView | large `exitUntilCollapsed` | 369 | 0 |
| **Total** | | | **1525** | **0** |

This validates the current 0.83 core scroll matrix for:

```text
single physics             yes
single movement owner      yes
parent proxy fling         no
scrollY sampling           no
parent child scroll        no
true pre/child/post        yes
touch + non-touch          yes
FlashList + RN ScrollView  yes
enterAlways                yes
exitUntilCollapsed         yes
FloatingToolbar settle     yes
TopAppBar settle            yes
transaction drift          0 / 1525 representative frames
```

## Two plumbing checks still separate from the core matrix

The core scroll transaction is revalidated. Two lifecycle/default-behavior checks remain intentionally separate because the three current runs did not exercise them:

1. **Delayed source mount fallback.** All three runs found their ReactScrollView on the immediate preparation path (`SOURCE_WAIT armed/removed = 0 / 0`). A diagnostic screen should deliberately mount the source after the host so the temporary `OnGlobalLayoutListener` path is exercised once.
2. **Unrelated ScrollView default.** The source patch now preserves the original nested-scroll enabled state, but a ScrollView outside `NativeScrollHost` should still receive a final runtime control pass before calling the entire prototype plumbing closed.

Neither item changes the measured transaction result above.

## React Native 0.83 source limitations

### Touch Parent3 limitation

React Native 0.83 is backed by `android.widget.ScrollView`. During touch, the platform implementation uses the older post-scroll nested contract and cannot receive the `NestedScrollingParent3 consumed[]` result after the parent consumes post-scroll distance.

For a valid parent transaction such as:

```text
requested=-26
child=0
parent post-consumes=-26
```

the parent is correct, but the legacy source cannot subtract those 26 pixels before its own edge overscroll/stretch decision. This cannot be fixed by adding intelligence to the screen ancestor because the touch loop belongs to `android.widget.ScrollView`.

AndroidX `NestedScrollView` owns that loop and supports Parent3 post-consumption accounting.

### Momentum limitation

Stock RN 0.83 `ReactScrollView` owns its fling without emitting each `OverScroller` step as a `TYPE_NON_TOUCH` nested-scroll transaction.

The prototype patch under `docs/upstream/` keeps React Native's source physics and exposes each real movement as:

```text
nested pre-scroll
-> ReactScrollView moves itself by the remainder
-> nested post-scroll
```

The parent never owns an `OverScroller`, never calls `scrollBy`/`scrollTo` on the source and never reconstructs momentum from sampled `scrollY`.

Together the touch and momentum findings define the upstream boundary:

```text
source responsibility:
  expose the complete nested-scrolling child transaction
  for every movement the source owns

screen responsibility:
  participate in that transaction and coordinate native chrome
```

## FlashList hard-fling blank-window control

An earlier violent FlashList fling showed visible blank content. A control without the module geometry reproduced the same problem:

| Run | Module geometry | Video frames | Blank frames |
|---|---|---:|---:|
| App bar present | scroll-away padding + translation | 38 | 12 |
| App bar absent | none | 36 | 14 |

The blank window therefore is not attributed to this transport/chrome architecture.
