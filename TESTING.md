# Host-app validation checklist

This archive is a local Expo module, not a complete Android host project. Validate it from the app that consumes the module.

## Rebuild native code

```powershell
npx expo run:android
```

If Gradle fails, keep the first Material3/Compose/Kotlin dependency or compiler error; later errors are often cascading.

## Minimal checks

1. Horizontal, standard, no FAB: `expanded` toggles leading/trailing content and keeps main content.
2. Horizontal, standard, attached FAB: `expanded` uses the native with-FAB animation.
3. `variant="vibrant"`: toolbar and FAB use vibrant Material defaults when colors are omitted.
4. Vertical: test `floatingActionButtonPosition="top"` and `"bottom"`.
5. `themeMode="system"`: switch Android light/dark mode while the app remains mounted.
6. `dynamicColor`: test on Android 12+ with no explicit color overrides first.
7. `insets="safe"`: verify gesture navigation and 3-button navigation.
8. `imeBehavior="hide"`: focus a text input and verify hide/show without JS keyboard state.
9. Icons: test an Android vector drawable via `resource`, a Metro `require(...)`, and a remote URI.
10. Overlay host: with `style={StyleSheet.absoluteFill}`, verify touches outside the toolbar still reach React Native content.

## Useful failure report

For a build issue, send:

- Expo SDK version;
- React Native version;
- Kotlin version from the host Gradle configuration;
- Android Gradle Plugin version;
- first Gradle/Kotlin compiler error around `expo-material-toolbar`;
- whether the app also uses another Compose-based Expo/native module.

For a runtime/layout issue, send a screenshot plus the `MaterialToolbar.Root` props used for that test.

## Overlay host / touch pass-through

1. Render `MaterialToolbar.Root` without a `style` prop and verify `placement="bottom"` + `insets="safe"` positions it above the navigation bar.
2. Tap/drag the RN screen outside the toolbar and verify underlying controls/scrollables still receive gestures.
3. Tap every toolbar action and the attached FAB and verify Compose click handling still works.
4. Toggle `visible` and `imeBehavior="hide"`; hidden toolbar bounds must stop intercepting touches.


## alpha.6 regression checks

1. Render `Root` without a `style` prop.
2. Tap buttons and scroll content in the screen above the toolbar; all must respond.
3. Tap the toolbar actions and FAB; they must still respond.
4. Set `Fab shape="circle"`; verify the container is circular in both standard and vibrant variants.
5. Verify a visible `Home` label by using `TextButton`, not `IconButton`.
6. Toggle `expanded` and `visible` to confirm the wrap-content child remeasures/repositions.

## Alpha 12 native scroll interop

With `scrollBehavior="exitAlways"` enabled on a bottom toolbar:

1. Use a standard React Native `ScrollView` or FlashList 2.0.2 with its default scroller; do not add a toolbar-specific `onScroll`.
2. Drag upward in the active list: the entire Material3 toolbar + attached FAB should move toward the inferred exit edge.
3. Drag downward: the toolbar should re-enter using the same Material3 scroll state.
4. Release in an intermediate position: Material3 should snap the toolbar to its final shown/hidden position.
5. After it is fully hidden, list rows in the former toolbar rectangle must remain tappable; reverse scrolling must make the toolbar visible again.
6. Switch tabs and scroll the newly interacted list; native `BEGIN_DRAG` should select that list as the active source without a ref or wrapper.
7. Verify toolbar buttons/FAB remain tappable while visible.

Custom FlashList `renderScrollComponent` implementations that do not use React Native Android `ReactScrollView` are not covered by automatic interop.

## Alpha 19 generic-consumer proof

First verify the existing FloatingToolbar behavior is unchanged from alpha.16. Then mount the experimental `MaterialTopAppBar` above the same RN/FlashList screen.

```tsx
import { MaterialTopAppBar } from 'expo-material-toolbar';

<MaterialTopAppBar
  title="Native scroll PoC"
  variant="medium"
  scrollBehavior="exitUntilCollapsed"
/>
```

Checks:

1. `variant="medium"` + `exitUntilCollapsed`: upward content scroll collapses the expanded row using Material3 `TopAppBarScrollBehavior`.
2. Return to y=0, then continue dragging downward after the RN child reaches the top edge; the native boundary gesture channel must provide Material3 post-scroll available distance and fully re-expand the app bar.
3. `variant="small"` + `enterAlways`: upward scroll hides/collapses, reverse scroll re-enters immediately.
4. Fling and release at an intermediate app-bar offset: Material3 performs the final settle/snap.
5. Mount the existing FloatingToolbar and TopAppBar together. Debug log lines beginning with `source frame` should report `clients=2` while both are visible on the same Fabric surface.
6. Confirm the FloatingToolbar still ignores top-edge bounce and does not remain partially translated after returning to y=0.
7. Switch tabs/screens: only native chrome hosts that are attached/shown on the active source's Fabric surface should react.
8. No list-specific JS `onScroll`, ref, or wrapper should be added for either native consumer.

Useful logs:

```bash
adb logcat -c
adb logcat -s ExpoMaterialToolbar:D
```

Expected TopAppBar diagnostics include `TOPAPPBAR_BEGIN`, `mode=EnterAlways|ExitUntilCollapsed`, `heightOffset`, `limit`, `boundary pull`, and `postAvailableY`.

Alpha.24 inset checks:

1. `variant="small"`: verify the title row starts below the status bar with no JS safe-area padding.
2. Debug log should include `topappbar rootInsets left=... top=... right=...`; on a normal portrait device `top` should be non-zero while status bars are visible.
3. Rotate / change edge-to-edge or cutout conditions and verify the expanded host / scroll-away geometry is remeasured rather than retaining the old inset.


### Alpha 19 repeated boundary cycle

For `variant="medium"` + `scrollBehavior="exitUntilCollapsed"`, repeat this at least five times without remounting the screen:

1. Start fully expanded at `scrollY=0`.
2. Scroll upward until the app bar is fully collapsed.
3. Scroll content away from the top.
4. Return to `scrollY=0`.
5. Continue dragging downward while the list is already at the top edge.
6. The app bar must follow the remaining finger distance toward `heightOffset=0`.
7. Release: Material3 may settle to the nearest endpoint, but a sufficiently long pull must settle fully expanded.
8. Collapse again and repeat.

The debug trace should show positive `boundary pull ... dy=...` lines followed by `postAvailableY>0` frames while `scrollY=0`. A bounce-back of Android's visual overscroll must not create negative/false content deltas in FloatingToolbar.


## Alpha.20 exitUntilCollapsed reconciliation

For `medium + exitUntilCollapsed`, verify repeated cycles without relying on Android edge stretch:

1. Start expanded at `scrollY=0`.
2. Scroll up until the app bar is fully collapsed.
3. Scroll well into the list.
4. Scroll back toward the top slowly. Expansion should begin while the RN source traverses the Material collapse range, and the app bar should be fully expanded when the logical child reaches the top.
5. Repeat at least five times.

In debug logs, `contentOffset` must never drift positive. At the expanded logical top it should be `0.0`; while content is below the top it should be non-positive. Alpha.19 `boundary pull` / `postAvailableY` remains a fallback diagnostic only after physical `scrollY=0`.

### Alpha 24 endpoint race regression

1. Repeat `expanded -> collapse -> expand` at least 10 times with slow drags and short releases near both endpoints.
2. Start a new drag immediately while the previous Material snap is still settling; the canceled settle must not move the list after the new gesture begins.
3. At fully expanded, verify the first content coordinate aligns exactly with expanded app-bar geometry (no residual 1-5 px overlap/gap).
4. At fully collapsed, verify the list reaches the collapse-corridor boundary together with the app bar.
5. Debug logs may include `topappbar endpointSync`; it should be a one-shot endpoint correction, never an oscillation.
