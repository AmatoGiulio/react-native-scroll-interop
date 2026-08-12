# Current RN 0.83 HEAD revalidation

This is the short operational checklist for validating the current `topappbar-inset-and-host-unification` branch after the parent/consumer cleanup.

The historical measured baseline remains in `docs/validation-rn-083.md`.

## Current matrix

| Screen | Source | TopAppBar | Shared FloatingToolbar | Status |
|---|---|---|---|---|
| Gallery | FlashList 2.0.2 | large `exitUntilCollapsed` | yes | revalidated |
| Feed | FlashList 2.0.2 | small `enterAlways` | yes | pending |
| Profile | RN ScrollView | large `exitUntilCollapsed` | yes | pending |

Gallery has already passed the current-head transaction/settle check. Do not change runtime scroll code before Feed and Profile are captured, or the Gallery result must be repeated.

## Capture one screen at a time

Clear logcat, start the filtered trace, exercise only one target screen, then stop logcat with Ctrl-C.

Example for Feed:

```bash
adb logcat -c
adb logcat -v time -s ExpoMaterialToolbar:D '*:S' | tee /tmp/m3-feed.log
```

Example for Profile:

```bash
adb logcat -c
adb logcat -v time -s ExpoMaterialToolbar:D '*:S' | tee /tmp/m3-profile.log
```

For each screen exercise:

1. slow drag;
2. short fling;
3. hard single-pointer fling;
4. reverse direction;
5. repeated collapse/expand;
6. top edge;
7. bottom edge where reachable;
8. a new touch while momentum or Material settle is still active.

## Analyze the trace

From the repository root:

```bash
npm run analyze:scroll-log -- /tmp/m3-feed.log
npm run analyze:scroll-log -- /tmp/m3-profile.log
```

The analyzer reports:

- touch and non-touch ledger frames;
- `balanced=false` / broken accounting;
- source-discovery listener balance;
- ambiguous ReactScrollView sources;
- completed vs canceled Material settles;
- completed settles that ended away from a Material endpoint;
- fling-saturation candidates.

### Trackpad/emulator saturation

A host trackpad can generate a synthetic sequence of touch/fling events that the Android emulator reports as repeated single-pointer gestures with fling velocity clamped at `+/-21000 px/s`.

The analyzer deliberately does **not** call those gestures invalid. It only classifies gestures at or above the configured saturation threshold as candidates.

If, and only if, the operator knows that those saturated gestures came from the host trackpad artifact, produce the representative sample with:

```bash
npm run analyze:scroll-log -- /tmp/m3-feed.log --exclude-saturated
npm run analyze:scroll-log -- /tmp/m3-profile.log --exclude-saturated
```

The whole gesture is excluded, not just its non-touch frames, so the selected sample remains internally coherent.

The current Gallery trace is reproduced by this rule as:

```text
all ledger frames                 986
saturated-candidate frames        359
representative-only frames        627
representative broken               0
representative balanced=false       0
```

Android reported `max pointers seen = 1` in that trace; the exclusion is about the known host input generator, not application-level multi-touch.

## What is a failure

The core gate is:

```text
Ledger gate:             PASS
Source-preparation gate: PASS
Floating settle check:   PASS
TopAppBar settle check:  PASS
```

Specifically:

```text
unbalanced = 0
max broken counter = 0
ambiguous React sources = 0
SOURCE_WAIT armed - removed = 0
completed FloatingToolbar non-endpoint settles = 0
completed TopAppBar non-endpoint settles = 0
```

`orphanPre` is diagnostic and is not a failure. `android.widget.ScrollView` can legitimately omit the post callback for a touch frame that was fully consumed in pre-scroll.

A canceled Material settle is also not a failure. It is expected when a new gesture takes ownership before the previous settle finishes. Only a **completed** settle is required to end at one of the Material endpoints.

## Screen-specific checks

### Feed — FlashList + small enterAlways

- reverse scrolling must make the small bar re-enter immediately, without waiting for list top;
- the shared FloatingToolbar follows only real child-consumed movement;
- a fling must continue to produce `NON_TOUCH` ledger frames;
- repeated reverse gestures must not accumulate toolbar drift.

### Profile — RN ScrollView + large exitUntilCollapsed

- collapse distance is consumed by the app bar before the list moves;
- once collapsed, the RN ScrollView receives the remainder normally;
- on return to the top, post-scroll available distance expands the app bar;
- the known platform `ScrollView` touch/Parent3 limitation may still affect local overscroll/stretch semantics, but must not break transaction conservation;
- a fling must continue through the source-owned `NON_TOUCH` path.

## Final promotion

When both pending traces pass, update `docs/validation-rn-083.md` to mark current HEAD fully revalidated and record their representative frame counts.

Only after that gate should runtime work resume on the remaining geometry ownership problem (`ReactScrollView` internal content translation / unstable scroll-away coupling).
