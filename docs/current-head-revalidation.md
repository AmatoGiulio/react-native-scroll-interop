# Current RN 0.83 HEAD revalidation

The core scroll matrix on `topappbar-inset-and-host-unification` is now revalidated. The measured record lives in `docs/validation-rn-083.md`.

## Core matrix status

| Screen | Source | TopAppBar | Shared FloatingToolbar | Representative frames | Broken |
|---|---|---|---|---:|---:|
| Gallery | FlashList 2.0.2 | large `exitUntilCollapsed` | yes | 627 | 0 |
| Feed | FlashList 2.0.2 | small `enterAlways` | yes | 529 | 0 |
| Profile | RN ScrollView | large `exitUntilCollapsed` | yes | 369 | 0 |
| **Total** | | | | **1525** | **0** |

Touch and source-owned `TYPE_NON_TOUCH` momentum are both covered. TopAppBar and FloatingToolbar settle checks pass with Material3's own TopAppBar expanded-endpoint rule (`collapsedFraction < 0.01`).

Do not change the runtime scroll transport while closing the two checks below; neither diagnostic route needs a transport change.

## Remaining check 1 — delayed source mount

Route: `delayed-source`

The route mounts `NativeScrollHost` and the large `exitUntilCollapsed` TopAppBar immediately, but waits 900 ms before mounting the RN ScrollView. This intentionally exercises the temporary `OnGlobalLayoutListener` fallback instead of the already-tested immediate preparation path.

After pulling the current branch and rebuilding the example, start a clean trace:

```bash
adb logcat -c
adb logcat -v time -s ExpoMaterialToolbar:D '*:S' | tee /tmp/m3-delayed-source.log
```

Open the diagnostic route with the Expo Router scheme:

```bash
adb shell am start \
  -a android.intent.action.VIEW \
  -d 'materialtoolbarexample://delayed-source' \
  expo.modules.materialtoolbar.example
```

Wait for the ScrollView to appear, then perform a few slow drags and one fling. Stop logcat with Ctrl-C.

Required evidence:

```text
SOURCE_WAIT layout-listener=armed
...
SOURCE_WAIT layout-listener=removed
```

and:

```text
ambiguousReactSources = 0
SOURCE_WAIT armed - removed = 0
broken = 0
```

Analyze it with:

```bash
npm run analyze:scroll-log -- /tmp/m3-delayed-source.log
```

Visually, the first mounted ScrollView frame must already use the TopAppBar geometry; the first gesture must not cause a padding/position jump.

## Remaining check 2 — unrelated RN ScrollView

Route: `plain-scroll-control`

This route contains a plain React Native ScrollView with no `NativeScrollHost` and no scroll-aware Material chrome. It is a runtime sanity check for the corrected RN 0.83 patch default semantics.

Open it with:

```bash
adb shell am start \
  -a android.intent.action.VIEW \
  -d 'materialtoolbarexample://plain-scroll-control' \
  expo.modules.materialtoolbar.example
```

Exercise:

1. slow drag in both directions;
2. short fling;
3. hard single-pointer fling;
4. interrupt a fling with a new touch;
5. reach both edges.

The ScrollView must behave like an ordinary RN ScrollView and must not require this module to move. Because the route mounts no native scroll host, `ExpoMaterialToolbar` should not open transaction sessions for its scrolling.

This check is intentionally behavioral. The patch itself already initializes the added helper from the ScrollView's existing nested-scroll state rather than forcing nested scrolling enabled globally.

## Analyzer usage

For any scroll trace:

```bash
npm run analyze:scroll-log -- /tmp/file.log
```

If the operator knows that saturated `+/-21000 px/s` fling sessions came from the host trackpad artifact, use:

```bash
npm run analyze:scroll-log -- /tmp/file.log --exclude-saturated
```

`orphanPre` is diagnostic and is not a failure on the legacy `android.widget.ScrollView` touch contract.

## After these two checks

Once the delayed listener path balances and the unrelated ScrollView control behaves normally, the RN 0.83 prototype plumbing can be considered closed.

The next major phase should be React Native 0.87: test the shipped `ReactNestedScrollView` path with `useNestedScrollViewAndroid` enabled and no custom 0.83 momentum patch before making any further source-side proposal.
