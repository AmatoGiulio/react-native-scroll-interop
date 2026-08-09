# Changelog

## 2.0.0-alpha.24

- Fixes embedded Compose TopAppBar system insets under React Native / Expo by mirroring root-window `systemBars + displayCutout` into Material3 explicitly; this restores the expected status-bar clearance for `variant="small"`.
- Resets measured expanded chrome geometry when physical root insets change, so scroll-away geometry follows rotation/cutout/edge-to-edge changes.
- Hardens `exitUntilCollapsed` against an intermittent 1-frame list/header drift seen in repeated runtime cycles. Logical child scroll is now derived from the full collapse range, never from the instantaneous animated `heightOffset`.
- Reconciles the RN ScrollView immediately when Material reaches the exact expanded/collapsed endpoint, eliminating residual 1-5 px skew at the boundary.
- Makes settle synchronization generation-safe: canceling a previous snap for a new drag can no longer run a stale final `scrollTo` or clear the newer settle job.
- Keeps alpha.22 scroll-away geometry and Material3 `1.5.0-alpha17`.

## 2.0.0-alpha.22

- Keeps alpha.21's native scroll-away geometry and Material settle synchronization, but prevents React Native's bookkeeping bottom padding from appearing as a permanent blank strip. The adapter temporarily disables `clipToPadding` while scroll-away is active, preserves the original ScrollView paddings, and restores the original visual state on detach.
- No screen-level `paddingTop` / `paddingBottom` compensation is required for the TopAppBar PoC.

## 2.0.0-alpha.21

- Replaces the temporary JS `paddingTop` requirement for scrolling TopAppBars with React Native 0.83's native `ReactScrollView.setScrollAwayTopPaddingEnabledUnstable(...)` path. The padding value comes from the real measured expanded Compose TopAppBar host, including Material3 window insets; no `112 + safeArea` duplication is required in the screen.
- Keeps the RN content view physically aligned with Material3 collapse/expand: during the collapse range the translated RN content rises by the same native scroll distance that shrinks the app bar, and after the collapse limit the remaining scroll continues through the list.
- Synchronizes RN `scrollY` with Material3 `heightOffset` during the native snap/settle animation, so releasing near either collapse limit moves the list together with the bar instead of snapping only the Compose chrome.
- Adds source discovery before the first drag so scroll-away geometry can be installed during layout instead of waiting for a scroll session.
- Extends scroll normalization to include native ScrollView padding in the effective range, preserving bottom-range sampling after scroll-away padding is installed.
- Keeps alpha.20 logical-child/post-available reconciliation and alpha.19 top-boundary MotionEvent fallback. Material3 remains pinned to `1.5.0-alpha17`.

## 2.0.0-alpha.20

- Reconciles `exitUntilCollapsed` reverse scrolling with the logical child position that a real Compose nested-scroll chain would have after TopAppBar pre-consumption.
- Splits downward RN movement into child-consumed distance and Material3 post-scroll `available` distance as the source crosses the collapse range, so expansion starts before Android overscroll and reaches the expanded state at the logical top boundary.
- Reconciles `TopAppBarState.contentOffset` from the observed RN scroll position minus the Material collapse range, preventing positive drift and incorrect overlapped/scrolled color state after repeated cycles.
- Keeps alpha.19 MotionEvent boundary tracking only as a fallback for genuine drag distance beyond physical `scrollY=0`.


## 2.0.0-alpha.19

- Fixes the remaining `exitUntilCollapsed` top-boundary gap found in alpha.18 runtime traces. Android `scrollY`/visual overscroll only exposed a few pixels of edge stretch, so Material3 could begin expanding but never receive enough post-scroll `available.y` distance before settling closed again.
- Adds an RN-adapter-local, non-consuming native touch observer only while an active `exitUntilCollapsed` drag is in progress. Once the registered RN vertical scroll source is already at y=0, downward finger distance is accumulated per display frame as true nested-scroll post-scroll available distance.
- Replaces the alpha.18 `topEdgePullDelta` transport field with `postAvailableY`; Material consumers no longer infer unconsumed gesture distance from raw overscroll coordinates.
- Keeps FloatingToolbar on normalized native scroll deltas only; it does not subscribe to the top-boundary gesture channel.
- Adds boundary diagnostics (`boundary pull` and `postAvailableY`) for validating repeated collapse -> top-edge expand cycles.
- This touch observer is intentionally isolated inside the RN source adapter and is not part of the generic Material consumer contract; an eventual react-native-screens integration can replace the source adapter without changing TopAppBar/FloatingToolbar consumers.
- Material3 remains pinned to `1.5.0-alpha17`. No React API changes.

## 2.0.0-alpha.18

- Corrects the TopAppBar `exitUntilCollapsed` adapter to replay Material3 nested-scroll phases instead of forwarding the entire sampled RN delta as post-scroll consumed distance. Upward movement now enters Material3 through `onPreScroll`, and only the remainder is forwarded to `onPostScroll`, matching the real `ExitUntilCollapsedScrollBehavior` state machine.
- Keeps top-edge pull residual separate and forwards it as positive post-scroll `available` distance so a collapsed medium/large app bar can expand only after the RN scrollable reaches its start edge.
- Fixes `MaterialTopAppBar` style composition: caller styles are now layered on top of the required absolute-fill host instead of replacing it.
- Documents the PoC layout requirement that overlay TopAppBars need the scroll content inset by the Material expanded app-bar height plus the top safe-area inset. This is intentionally a screen-layout concern; a future react-native-screens integration can own that inset natively.
- Keeps Material3 pinned to `1.5.0-alpha17`; existing FloatingToolbar behavior is unchanged.

## 2.0.0-alpha.17

- Adds a minimal experimental `MaterialTopAppBar` backed by the real Material3 `TopAppBar`, `MediumTopAppBar`, and `LargeTopAppBar` composables.
- Adds `TopAppBarScrollConsumer`, driven through the same generic `NativeScrollConsumer` contract as `FloatingToolbarScrollConsumer`.
- Converts the RN scroll transport into a shared native hub: multiple visible chrome hosts on the same Fabric surface receive one sampled native `ReactScrollView` stream instead of registering independent per-component listeners.
- Adds `NativeScrollFrame` so normalized content delta and top-edge pull residual are distinct signals; FloatingToolbar ignores edge bounce, while `exitUntilCollapsed` can receive Material3-style positive post-scroll `available` distance at the top edge.
- Supports `scrollBehavior="enterAlways"` and `scrollBehavior="exitUntilCollapsed"` on the experimental TopAppBar PoC without adding a JS `onScroll` callback or list ref.
- Keeps Material3 pinned to `1.5.0-alpha17` and leaves the existing `MaterialToolbar` React API unchanged.

## 2.0.0-alpha.16

- Refactors native RN scroll discovery/sampling into `ReactNativeScrollCoordinator` behind the generic `NativeScrollConsumer` contract.
- Moves Material3-specific offset, geometry and settle handling into `FloatingToolbarScrollConsumer`; the consumer no longer depends on React Native or FlashList APIs.
- Keeps the public React API and the alpha.15 runtime behavior unchanged.
- Fixes the missing `android.os.Build` import in `ExpoMaterialToolbarView.kt` introduced by the refactor.

## 2.0.0-alpha.15

- Fixes the remaining exitAlways visual bug exposed by alpha.14 runtime logs: RN scroll deltas and Material3 state were already updating correctly, but Material3 was translating toolbar content inside a WRAP_CONTENT ComposeView.
- Keeps the real Material3 `exitAlwaysScrollBehavior` as the offset/snap state engine, but applies its `state.offset` to the Android `ComposeView` translation so the whole native host moves toward the screen edge without Compose-surface clipping.
- Computes `offsetLimit` from the actual Android host/ComposeView screen-edge geometry instead of the toolbar's internal Compose parent.
- Removes the alpha.12-14 `View.INVISIBLE` hidden-state workaround; Android hit-testing now follows the translated wrap-content child naturally.
- Normalizes ReactScrollView edge overscroll so negative/top-bounce pixels do not leave the toolbar partially collapsed after returning to the top.
- Keeps the frame-sampled RN 0.83 native scroll source; no React API changes.

## 2.0.0-alpha.14

- Fixes the Compose geometry used by Material3 `exitAlwaysScrollBehavior` while keeping the Android `ComposeView` wrap-content for React Native hit-testing.
- The toolbar is now a direct child of a custom Compose host layout whose measured size includes safe-area / edge padding, so Material3 computes a stable `FloatingToolbarState.offsetLimit` against the actual exit edge instead of a wrap-content parent.
- Keeps the frame-sampled native RN scroll adapter introduced in alpha.13; no React API changes.
- Debug builds emit throttled `ExpoMaterialToolbar` logcat lines with native `dy`, Material3 `offset`, and `offsetLimit` so any remaining mismatch can be diagnosed from runtime values instead of another blind iteration.
- Removes the previous assumption that RN event cadence was the primary cause of the abrupt hide/show behavior.

## 2.0.0-alpha.13

- Reworks RN-to-Compose scroll delivery to sample the active native `ReactScrollView.scrollY` once per Android display frame with `Choreographer`.
- `ReactScrollViewHelper.ScrollListener` is now used only for active-source and drag lifecycle discovery; it no longer drives `FloatingToolbarScrollBehavior` directly from RN event cadence.
- Keeps sampling through drag and native fling until four stable frames, then asks Material3 `onPostFling` to perform the native snap.
- Public React API is unchanged (`scrollBehavior="exitAlways"`).

## 2.0.0-alpha.12

- Adds `scrollBehavior="exitAlways"`, backed by the real Material3 `FloatingToolbarDefaults.exitAlwaysScrollBehavior`.
- Android listens directly to RN 0.83 `ReactScrollViewHelper.ScrollListener`; no extra JS `onScroll`, list ref, or per-screen `ScrollSource` wrapper is required for standard RN ScrollView/FlashList 2.0.2.
- Native RN scroll deltas are adapted to Compose `NestedScrollConnection.onPostScroll`, and Material3 performs its own final snap through `onPostFling`.
- Adds optional `scrollExitDirection="top | bottom | start | end"`; omitted direction is inferred from toolbar alignment/placement.
- Filters scroll sources to attached, visible, vertically scrollable views on the same Fabric surface. The active source is selected on native `BEGIN_DRAG` and retained through fling.
- Fully hidden toolbars make their wrap-content Compose child `INVISIBLE` after Material settles, avoiding an invisible native hit-test region; the child is restored before reverse-scroll input.
- Material3 remains pinned to `1.5.0-alpha17` for Expo SDK 55 compatibility.

## 2.0.0-alpha.11

- Fixes the React Native 0.83 Kotlin signature for `ReactPointerEventsView`: the interface exposes `val pointerEvents: PointerEvents`, not a Java-style `getPointerEvents()` override.
- The host now implements `override val pointerEvents get() = PointerEvents.BOX_NONE`.
- No React API, Compose layout, or selection behavior changes.


## 2.0.0-alpha.10

- Fixes the alpha.9 Android Kotlin build by adding an explicit `com.facebook.react:react-android` dependency to the Expo module.
- `ReactPointerEventsView` and `PointerEvents` are React Native Android classes; the Expo module plugin did not place them on this library module's compile classpath automatically.
- Keeps the alpha.9 native `BOX_NONE` hit-testing implementation unchanged.
- Synchronizes the Android library version metadata with the package version.


## 2.0.0-alpha.9

- Fixes Android React Native hit-testing for the full-screen overlay host.
- `ExpoMaterialToolbarView` now implements React Native `ReactPointerEventsView` and reports `PointerEvents.BOX_NONE` natively. The JS `pointerEvents="box-none"` prop alone was not sufficient for this custom Expo native ViewGroup under RN 0.83/Fabric.
- The wrap-content Compose child remains the only interactive native region; touches outside it can continue to lower React Native siblings such as lists and pressable rows.
- No public React API changes.

## 2.0.0-alpha.8

- Adds bridge-level `selected` state to toolbar actions for navigation-style use.
- Selected `TextButton`s keep the real Compose Material3 `TextButton` and use its container/content colors as the active indicator.
- Selected `IconButton`s receive a circular active container while retaining the real Material3 `IconButton`.
- Adds `colors.selectedContainer`, `colors.selectedContent`, and `colors.unselectedContent`; defaults follow the Material color scheme (`secondaryContainer`, `onSecondaryContainer`, toolbar content).
- Selection is visual only and does **not** inject `Role.Tab`.

## 2.0.0-alpha.7

- Fix Android Kotlin compilation regression introduced in alpha.6 by restoring the `android.graphics.Color` import used by Expo color props and `Color.toArgb()`.
- No React API or layout behavior changes from alpha.6.

## 2.0.0-alpha.6

- Fixed the full-screen overlay stealing touches from the React Native screen.
  The RN host remains full-screen, but now uses `pointerEvents="box-none"` and
  the actual Android `ComposeView` is measured/layout as wrap-content at the
  requested alignment. Only the toolbar/FAB native rectangle participates in
  hit-testing.
- Added `<MaterialToolbar.Fab shape="circle" />`, mapped directly to Compose
  `CircleShape`. `shape="default"` keeps `FloatingActionButtonDefaults.shape`.
- Safe-area/edge padding is now applied only on the edge(s) implied by the
  toolbar alignment, which is required for the wrap-content native host.
- Clarified that `IconButton` is the icon action. A visible icon + label action
  should use `TextButton`, matching the Material toolbar action model.

## 2.0.0-alpha.5

- `MaterialToolbar.Root` now defaults to a full-screen absolute overlay when no `style` is provided, so `placement`, `edgeOffset` and safe drawing insets work without `useSafeAreaInsets()` or manual Yoga bounds.
- The Android host tracks the actual Compose toolbar + attached FAB bounds with `onGloballyPositioned`.
- Touch sequences that start outside those bounds return `false` from the native overlay, allowing the React Native screen underneath to keep receiving gestures.
- Passing an explicit `style` still opts into custom host bounds.

## 2.0.0-alpha.4

- Fixed Expo 55 / Compose 1.11 compile errors caused by missing `calculateStartPadding` and `calculateEndPadding` extension imports.
- No public React API changes.
- Material3 remains pinned to `1.5.0-alpha17`.

## 2.0.0-alpha.3

- Target Material 3 `1.5.0-alpha17` for the Expo SDK 55 / AGP 8.12 / compileSdk 36 toolchain.
- Add the required `ExperimentalMaterial3ExpressiveApi` opt-in because FloatingToolbar is still experimental in alpha17.
- Keep the real Compose Horizontal/Vertical FloatingToolbar API surface, including attached FAB overloads, leading/trailing slots, standard/vibrant colors, positions and elevations.
- Retain the `placement` bridge shorthand fix introduced in alpha.2.
- Do not use alpha18+ in the Expo 55 build: Compose 1.12.0-alpha01 moved Compose to compileSdk 37.

## 2.0.0-alpha.2

- Target Material 3 `1.5.0-alpha23` for Expo SDK 55 / compileSdk 36 compatibility.
- Avoid Material 3 alpha24+ because that line updates Compose dependencies to 1.12.0-beta01, which requires compileSdk 37 / AGP 9.1.
- Add `placement="top | center | bottom"` as a bridge-level shorthand. `alignment` still supports the full 2D host alignment and takes precedence.

## 2.0.0-alpha.1

- Upgrade Material 3 Compose from `1.4.0-alpha17` to `1.5.0-alpha25`.
- Replace custom selected/tab content with stock `IconButton` and `TextButton` content.
- Add horizontal and vertical floating toolbar orientations.
- Add leading/trailing no-FAB slots.
- Add native standard/vibrant attached FAB variants and orientation-specific positions.
- Use current Material toolbar defaults for content padding, screen offset and elevations.
- Keep system theme, dynamic colors, safe insets, native IME hide, image resources and animated host visibility.
- Remove independent FAB visibility controls so the attached FAB follows the real with-FAB toolbar overload.
- Remove selected color roles and imperative scroll-offset API.
- Remove the old `Bar`/`Item`/`value`/`onValueChange` tab-style API instead of preserving synthetic toolbar semantics.
