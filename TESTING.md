# Testing

This repository contains a local Expo module plus an Android example app. Native-scroll validation must be run from the consuming example because the behavior depends on the real React Native ScrollView, Android nested scrolling and Material3 runtime state.

## Build the example

From `example/`:

```bash
npx expo run:android
```

If Gradle fails, keep the first Material3/Compose/Kotlin compiler or dependency error. Later errors are often cascading.

## Basic toolbar regression checks

Before testing scroll interop, verify the standalone toolbar behavior still works:

1. Horizontal standard toolbar with and without an attached FAB.
2. `variant="vibrant"` with Material defaults.
3. Vertical toolbar with FAB at both supported positions.
4. `themeMode="system"` while switching Android light/dark mode without remounting.
5. `dynamicColor` on Android 12+ with no explicit color overrides.
6. `insets="safe"` under gesture and 3-button navigation.
7. `imeBehavior="hide"` while focusing and dismissing a text input.
8. Android resource icon, Metro asset and remote URI icon paths.
9. Overlay/touch pass-through: touches outside visible native chrome still reach React Native content.
10. Toolbar actions and FAB remain tappable while visible and stop intercepting after they are hidden.

## Native-scroll invariant

The current architecture has one movement owner:

```text
React Native source
  -> nested pre-scroll
  -> source moves the remainder itself
  -> nested post-scroll
  -> native chrome
```

The parent must never call `scrollBy` or `scrollTo` on the source, run a proxy `OverScroller`, sample `scrollY` as transport or reconstruct missing deltas.

For every accounted frame the debug ledger checks:

```text
requested = chromePre + childConsumed + chromePost + remaining
```

The acceptance condition is zero broken/unbalanced accounted frames.

`orphanPre` is not a failure. On React Native 0.83, `android.widget.ScrollView` can omit the post callback for a touch frame that was fully consumed during pre-scroll.

## Current scroll matrix

| Screen | Source | TopAppBar | Shared FloatingToolbar |
|---|---|---|---|
| Gallery | FlashList 2.0.2 | large `exitUntilCollapsed` | yes |
| Feed | FlashList 2.0.2 | small `enterAlways` | yes |
| Profile | RN ScrollView | large `exitUntilCollapsed` | yes |

This gives two independent behavior shapes and two source implementations without adding a list-specific JS `onScroll` handler or native ref transport.

## Gesture matrix

Run the following on every target screen:

1. slow upward drag;
2. slow reverse drag;
3. short fling;
4. hard single-pointer fling;
5. repeated collapse/expand cycles;
6. top-edge return and continued downward drag;
7. bottom edge where the content is long enough;
8. new touch while source momentum is still running;
9. new touch while a Material terminal settle is still running;
10. switch tabs/screens and verify only the currently interacted source drives screen chrome.

### Feed-specific

`small + enterAlways` must re-enter immediately when direction reverses. It must not wait for the list to return to the top.

### Profile/Gallery-specific

`large + exitUntilCollapsed` must:

1. consume only the app bar's actual collapse distance in pre-scroll;
2. let the source scroll the remainder itself;
3. keep the app bar collapsed while ordinary reverse scrolling is still inside the list;
4. receive top-edge available distance in post-scroll and expand from that real source report.

## Capture diagnostics

Capture one screen per log file.

```bash
adb logcat -c
adb logcat -v time -s ExpoMaterialToolbar:D '*:S' | tee /tmp/m3-scroll.log
```

Stop with Ctrl-C after the gesture matrix.

Useful records include:

```text
SOURCE_TREE
SOURCE_WAIT
TX_BIND
NESTED_START
TX_PRE
TX_POST
TX_LEDGER
NESTED_PRE_FLING
NESTED_STOP
TX_TOP_SETTLE_START / END
FLOAT_SETTLE_START / END
```

For a source-owned fling, the expected lifecycle is:

```text
TOUCH
  -> NESTED_PRE_FLING
  -> TYPE_NON_TOUCH starts
  -> TOUCH stops without settling chrome
  -> NON_TOUCH frames continue
  -> TYPE_NON_TOUCH stops
  -> Material terminal settle
```

A new touch may cancel an in-progress terminal settle. A canceled settle is expected; only a settle that logs `completed=true` is required to end at a Material endpoint.

## Analyze the log

From the repository root:

```bash
npm run analyze:scroll-log -- /tmp/m3-scroll.log
```

The analyzer reports:

- touch/non-touch accounted frames;
- unbalanced frames and the maximum broken counter;
- maximum observed orphan-pre counter;
- source-wait listener arm/remove balance;
- ambiguous ReactScrollView discovery;
- completed and canceled TopAppBar/FloatingToolbar settles;
- completed settles that ended between Material endpoints;
- fling saturation candidates.

The desired summary is:

```text
Ledger gate:             PASS
Source-preparation gate: PASS
Floating settle check:   PASS
TopAppBar settle check:  PASS
```

## Emulator/trackpad saturated input

Two-finger host-trackpad scrolling can make the Android emulator synthesize repeated single-pointer gesture/fling sequences whose reported velocity saturates at `+/-21000 px/s`.

Those events are useful as an extra torture test, but they should not silently replace the representative single-pointer gesture sample.

The analyzer classifies any gesture at or above its configured saturation threshold as a candidate but does not automatically call it invalid.

If the operator knows that the saturated gestures in a trace came from that host-input artifact, run:

```bash
npm run analyze:scroll-log -- /tmp/m3-scroll.log --exclude-saturated
```

The analyzer excludes the complete gesture, including its touch phase, rather than deleting only the high-velocity non-touch frames.

The threshold can be changed explicitly:

```bash
npm run analyze:scroll-log -- /tmp/m3-scroll.log --exclude-saturated --saturation 20000
```

Use `--json` when a machine-readable report is useful.

## Source preparation

The prototype host prepares the source before the first gesture without fixed mount-delay timers.

Two valid paths exist:

### Immediate

The ReactScrollView already exists when preparation runs. `SOURCE_TREE ... chromePrepared=true` appears and there may be no `SOURCE_WAIT` lines at all.

### Delayed mount

The source is not present yet. The host should log:

```text
SOURCE_WAIT layout-listener=armed
...
SOURCE_WAIT layout-listener=removed
```

The listener must not remain armed after a source becomes available.

Multiple ReactScrollViews in the same host are ambiguous for prototype pre-gesture geometry and must fail closed rather than selecting one heuristically.

## Geometry checks

The current prototype still reserves TopAppBar space through React Native's unstable scroll-away padding primitive and translates the internal ReactScrollView content child as Material collapses/expands.

Until that bridge is replaced, verify:

1. correct inset before the first gesture;
2. no first-gesture jump;
3. no residual gap/overlap at fully expanded or collapsed endpoints;
4. correct geometry after screen/tab remount;
5. correct geometry after rotation/inset changes;
6. no persistent blank strip at the bottom caused by the bookkeeping padding.

A FlashList blank-content window under violent fling is not, by itself, evidence against this geometry bridge: the same failure has been reproduced in a control without module geometry. If blanking changes materially, repeat the control before assigning causality.

## Known React Native 0.83 source limitations

The test should distinguish parent correctness from source limitations.

### Touch Parent3 accounting

React Native 0.83 uses `android.widget.ScrollView`. Its touch loop cannot receive the parent's `NestedScrollingParent3 consumed[]` post-consumption before local overscroll/stretch handling.

The parent can therefore account a top-edge frame correctly while the source still has incomplete knowledge for its own edge effect.

### Momentum

The PoC uses the source patch under `docs/upstream/` so React Native's own `OverScroller` reports its real movement as `TYPE_NON_TOUCH` nested scrolling. The parent still does not own or replay the fling.

## Current-head validation status

The historical `0 / 566` measured baseline and the current-head revalidation record live in:

```text
docs/validation-rn-083.md
```

The concise procedure and remaining screen gate live in:

```text
docs/current-head-revalidation.md
```

Do not resume runtime refactoring of the geometry bridge until the current Feed and Profile runs have passed the same transaction/settle gate already passed by Gallery.

## Useful failure report

For build failures include:

- Expo SDK version;
- React Native version;
- Kotlin version;
- Android Gradle Plugin version;
- first Gradle/Kotlin error around `expo-material-toolbar`.

For runtime failures include:

- target screen/source;
- exact gesture that reproduced it;
- `/tmp/m3-*.log` trace;
- analyzer output;
- screen recording if the failure is visual;
- whether saturated trackpad input was used.
