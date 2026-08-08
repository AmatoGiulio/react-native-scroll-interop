# Validation

Everything below runs against the example app in `example/`, which is deliberately shaped like a
real app: three bottom tabs, all mounted at once, a FlashList image grid, a FlashList feed, and a
plain React Native `ScrollView`.

```bash
cd example && npx expo run:android
```

```bash
adb shell setprop log.tag.MaterialToolbar DEBUG && adb logcat -c && adb logcat -s MaterialToolbar:D
```

The trace works in release builds too — it is gated on `Log.isLoggable`, not on `BuildConfig`.

## Automated

```bash
cd example/android && ./gradlew :expo-material-toolbar:testDebugUnitTest
```

`InteropBoundaryTest` fails if a Material consumer or the transport-neutral contract acquires a
`com.facebook.react` or `expo.modules` import. It is the executable form of the architecture claim,
so treat a failure as a design regression rather than a lint nit.

```bash
npm run typecheck   # library
```

## Per-screen expectations

| screen | source | app bar | toolbar |
| --- | --- | --- | --- |
| Gallery | FlashList grid | `medium` + `exitUntilCollapsed` | floating, `exitAlways` |
| Feed | FlashList rows | `small` + `enterAlways` | — |
| Profile | plain `ScrollView` | `large` + `exitUntilCollapsed` | — |

Profile exists to prove the transport is not accidentally coupled to how FlashList happens to
scroll. If Profile behaves differently from Gallery, that is the bug.

## Manual matrix

### 1. Basic collapse and expand

1. Gallery, from the top: scroll up until the app bar is fully collapsed.
2. Scroll well into the grid, then back toward the top slowly.
3. Expansion should begin while the source traverses the collapse range, and the bar should be
   fully expanded exactly when the first row reaches the top.
4. Repeat five times. `contentOffset` in the trace must never drift positive.

### 2. Endpoint races

1. Repeat expand → collapse → expand ten times with slow drags and short releases near both ends.
2. Start a new drag while the previous Material snap is still settling. The cancelled settle must
   not move the list after the new gesture takes over.
3. At full expansion, the first content row must align with the app bar with no residual gap.

### 3. Fling and settle

1. Fling hard, then let it come to rest without touching the screen.
2. Release mid-collapse at low and high velocity and compare the snap direction with a real Compose
   app. Velocity is now forwarded to `onPostFling`; a wrong sign shows up here as a snap that goes
   the wrong way at speed.
3. Trace lines should show `phase=Fling` during momentum and `phase=Drag` only while touching.

### 4. Scrolls that are not gestures — the accessibility case

This is the class of bug that a drag-gated implementation cannot even see.

1. Enable TalkBack. Swipe-navigate through grid items past the bottom of the viewport, so TalkBack
   issues `ACTION_SCROLL_FORWARD`. The app bar must collapse as the content moves.
2. With a mouse or trackpad attached, scroll with the wheel. Same expectation.
3. Trace should show `phase=Programmatic` sessions with no `BEGIN_DRAG`.

### 5. Multiple mounted lists

1. Scroll Gallery to a collapsed state, switch to Feed, scroll, switch back.
2. Each screen must retain its own state, and only the visible screen's chrome may react.
3. With both a top app bar and a floating toolbar visible, both must react to the same drag.

### 6. Self-driven scroll must not oscillate

1. Release exactly at an endpoint repeatedly.
2. `endpointSync` / settle repositioning must be one-shot. Any repeating pattern in the trace at
   rest is the re-entrancy guard failing.

### 7. Touch pass-through

1. With the floating toolbar hidden by scroll, grid cells in its former rectangle stay tappable.
2. Toolbar actions and the FAB respond while visible.

## Declared unsupported

Stated explicitly, because ambiguity is worse than a documented gap:

- custom FlashList `renderScrollComponent` that is not a React Native `ReactScrollView`;
- horizontal and inverted lists;
- nested vertical scrollers — discovery resolves to the outer one;
- `maintainVisibleContentPosition` combined with `exitUntilCollapsed`;
- iOS: the module is Android-only.

## Reporting a failure

Include the Expo SDK and React Native version, the screen, the trace around the failure, and
whether the same behaviour reproduces on Profile (plain `ScrollView`) as well as on a FlashList
screen. That last detail separates transport bugs from list-library bugs faster than anything else.
