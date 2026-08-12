# Current RN 0.83 HEAD revalidation — complete

The `topappbar-inset-and-host-unification` React Native 0.83 prototype is fully revalidated. Detailed evidence lives in `docs/validation-rn-083.md`.

## Final measured matrix

| Screen | Source | TopAppBar | Shared FloatingToolbar | Representative frames | Broken |
|---|---|---|---|---:|---:|
| Gallery | FlashList 2.0.2 | large `exitUntilCollapsed` | yes | 627 | 0 |
| Feed | FlashList 2.0.2 | small `enterAlways` | yes | 529 | 0 |
| Profile | RN ScrollView | large `exitUntilCollapsed` | yes | 369 | 0 |
| **Core total** | | | | **1525** | **0** |

The Gallery raw trace also contained synthetic host-trackpad fling saturation at `+/-21000 px/s`; those sessions were retained as torture evidence but excluded from the representative sample because the operator identified their input source.

## Delayed source-mount fallback

The diagnostic `delayed-source` route deliberately withholds its RN ScrollView for 900 ms after `NativeScrollHost` and TopAppBar mount.

Measured result:

```text
ledger frames               216
unbalanced                    0
max broken counter            0
SOURCE_WAIT armed/removed  1 / 1
listener balance              0
ambiguous React sources       0
TopAppBar non-endpoint        0
```

The route intentionally has no FloatingToolbar, so a zero toolbar settle count is expected.

## Unrelated ScrollView control

The `plain-scroll-control` route mounts an ordinary RN ScrollView with no `NativeScrollHost` and no Material scroll-aware chrome. Drag, fling, reverse, interruption and edge behavior remained normal. Its visible title block is intentionally static.

## Closed acceptance gate

```text
0 broken core ledger frames                 PASS
TOUCH + NON_TOUCH source-owned transaction  PASS
no first-gesture/source-preparation failure PASS
Material-consistent FloatingToolbar settle  PASS
Material-consistent TopAppBar settle        PASS
delayed source listener arm/remove          PASS
unrelated RN ScrollView behavior            PASS
```

The RN 0.83 prototype is now evidence, not the next implementation target. Runtime work should continue on a separate React Native 0.87 branch by testing the existing AndroidX `ReactNestedScrollView` path before carrying forward the 0.83 momentum patch.
