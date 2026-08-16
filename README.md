# expo-material-toolbar

Android-only Expo native module bridging Material 3 Compose chrome to React Native, with native scroll interop designed around React Native-owned gesture/fling physics and Android's real synchronous nested-scroll transaction.

> Repository status (2026-08-16): this repository contains both historical prototype material and the current RN 0.86 compatibility / RN 0.87+ architecture line. The GitHub default branch is currently legacy and is not the source of truth for current development. Use [`docs/HANDOFF_CURRENT.md`](docs/HANDOFF_CURRENT.md) for the active handoff and [`docs/CHECKPOINTS.md`](docs/CHECKPOINTS.md) for frozen evidence branches.

Current invariant:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native chrome consumers
```

Current compatibility state:

- RN 0.86.2 / Expo SDK 57 fresh external consumer: validated locally through package install, config plugin, clean prebuild, ReactAndroid source build, install/runtime, TopAppBar, FloatingToolbar and NON_TOUCH behavior. The clean remote CI/EAS reproducibility gate remains separate.
- RN 0.87+: multi-consumer source-owned architecture and hardening checkpoints are already validated.
- React Native source-boundary fix: upstream PR `react/react-native#57972` is open. It preserves the ordinary `ReactNestedScrollView` NON_TOUCH nested-scroll lifecycle by delegating the generated non-paging fling path to AndroidX while keeping React Native as the sole owner of fling initiation/physics.

The package remains an internal alpha workspace (`private: true`). Publication boundaries and npm contents are intentionally not treated as repository-cleanup work.

## Material toolbar API

The native toolbar is one of:

- `HorizontalFloatingToolbar`
- `VerticalFloatingToolbar`

The attached FAB uses:

- `FloatingToolbarDefaults.StandardFloatingActionButton`
- `FloatingToolbarDefaults.VibrantFloatingActionButton`

Toolbar actions use stock Material 3 `IconButton` or `TextButton` composables. There is no custom selected pill, no `Role.Tab`, and no native selected-tab model.

`Content`, `LeadingContent`, `TrailingContent`, `IconButton`, `TextButton`, `Icon`, `Text`, and `Fab` are React descriptors parsed by `Root`; they do not mount nested React Native views.

## Basic horizontal toolbar

```tsx
<MaterialToolbar.Root
  style={StyleSheet.absoluteFill}
  visible={tabsFocused}
  expanded
  orientation="horizontal"
  variant="standard"
  placement="bottom"
  insets="safe"
  themeMode="system"
  dynamicColor={false}
  imeBehavior="hide"
  colors={{
    toolbarContainer: theme.colors.surface,
    toolbarContent: theme.colors.text.primary,
    fabContainer: theme.colors.chrome.tabIndicator,
    fabContent: theme.colors.text.primary,
  }}
>
  <MaterialToolbar.Content>
    <MaterialToolbar.IconButton
      id="home"
      accessibilityLabel="Home"
      onPress={() => router.navigate('/(main)')}
    >
      <MaterialToolbar.Icon resource="ic_home" />
    </MaterialToolbar.IconButton>

    <MaterialToolbar.IconButton
      id="archive"
      accessibilityLabel="Schedario"
      onPress={() => router.navigate('/(main)/schedario')}
    >
      <MaterialToolbar.Icon resource="ic_archive" />
    </MaterialToolbar.IconButton>
  </MaterialToolbar.Content>

  <MaterialToolbar.Fab
    accessibilityLabel="Cerca"
    onPress={() => router.push('/(main)/(search)/search')}
  >
    <MaterialToolbar.Icon
      source={require('./assets/search.png')}
      tint="content"
    />
  </MaterialToolbar.Fab>
</MaterialToolbar.Root>
```

`placement="bottom"` is the bridge default, so for a bottom floating toolbar it can be omitted. `alignment` remains available for advanced 2D positioning and takes precedence over `placement`. If the native view fills the screen, `insets="safe"` and the Material `ScreenOffset` are applied natively; `useSafeAreaInsets()` is not required for toolbar placement.

## Vertical toolbar

```tsx
<MaterialToolbar.Root
  style={StyleSheet.absoluteFill}
  orientation="vertical"
  alignment="centerEnd"
  insets="safe"
  floatingActionButtonPosition="bottom"
>
  <MaterialToolbar.Content>
    <MaterialToolbar.IconButton id="edit" onPress={edit} accessibilityLabel="Modifica">
      <MaterialToolbar.Icon resource="ic_edit" />
    </MaterialToolbar.IconButton>
    <MaterialToolbar.IconButton id="share" onPress={share} accessibilityLabel="Condividi">
      <MaterialToolbar.Icon resource="ic_share" />
    </MaterialToolbar.IconButton>
  </MaterialToolbar.Content>

  <MaterialToolbar.Fab accessibilityLabel="Aggiungi" onPress={create}>
    <MaterialToolbar.Icon resource="ic_add" />
  </MaterialToolbar.Fab>
</MaterialToolbar.Root>
```

Horizontal attached FAB positions are `start | end`. Vertical attached FAB positions are `top | bottom`.

## No-FAB expanded slots

The no-FAB Compose overload exposes `leadingContent` and `trailingContent`. The bridge mirrors those slots:

```tsx
<MaterialToolbar.Root expanded={expanded}>
  <MaterialToolbar.LeadingContent>
    <MaterialToolbar.IconButton id="back" onPress={back} accessibilityLabel="Indietro">
      <MaterialToolbar.Icon resource="ic_arrow_back" />
    </MaterialToolbar.IconButton>
  </MaterialToolbar.LeadingContent>

  <MaterialToolbar.Content>
    <MaterialToolbar.IconButton id="favorite" onPress={favorite} accessibilityLabel="Preferito">
      <MaterialToolbar.Icon resource="ic_favorite" />
    </MaterialToolbar.IconButton>
  </MaterialToolbar.Content>

  <MaterialToolbar.TrailingContent>
    <MaterialToolbar.IconButton id="more" onPress={more} accessibilityLabel="Altro">
      <MaterialToolbar.Icon resource="ic_more_vert" />
    </MaterialToolbar.IconButton>
  </MaterialToolbar.TrailingContent>
</MaterialToolbar.Root>
```

With the no-FAB overload, Compose uses `expanded` to show/hide the leading and trailing slots while preserving the main content. When an attached `Fab` is present, the native FAB overload is used and the toolbar follows its native expanded/collapsed behavior.

## Text actions

```tsx
<MaterialToolbar.TextButton id="save" onPress={save} accessibilityLabel="Salva">
  <MaterialToolbar.Icon resource="ic_save" size={18} />
  <MaterialToolbar.Text>Salva</MaterialToolbar.Text>
</MaterialToolbar.TextButton>
```

`TextButton` maps to Material 3 `TextButton`; `IconButton` maps to Material 3 `IconButton`. The toolbar content slot itself remains Compose-owned.

## Theme and colors

```tsx
<MaterialToolbar.Root
  themeMode="system"
  dynamicColor
  variant="vibrant"
  colors={{
    toolbarContainer: theme.colors.surface,
    toolbarContent: theme.colors.text.primary,
    fabContainer: theme.colors.chrome.tabIndicator,
    fabContent: theme.colors.text.primary,
  }}
/>
```

- `themeMode="system"` follows Android light/dark mode natively.
- `themeMode="light" | "dark"` forces the fallback Material color scheme.
- `dynamicColor` uses Android 12+ dynamic colors.
- Every omitted color keeps the selected Material standard/vibrant default.

`selectedContainer`, `selectedContent`, and `unselectedContent` are bridge-level visual roles for the optional `selected` state on real Material3 `TextButton` / `IconButton` actions. They do not add tab semantics or a selected-item API to `FloatingToolbar`.

## Insets and placement

`placement` is a bridge-level shorthand (`top | center | bottom`) that maps to `topCenter | center | bottomCenter`. Use `alignment` when you need start/end positioning.

`alignment` can be:

- `topStart`, `topCenter`, `topEnd`
- `centerStart`, `center`, `centerEnd`
- `bottomStart`, `bottomCenter`, `bottomEnd`

`insets="safe"` uses `WindowInsets.safeDrawing`. `edgeOffset` is an additional dp distance from the aligned screen edge. If omitted, the native `FloatingToolbarDefaults.ScreenOffset` is used.

The native view still needs bounds covering the area in which Compose is allowed to draw. For the navigation-overlay use case, `style={StyleSheet.absoluteFill}` is the simplest host shape.

## Material layout overrides

The bridge exposes the portable numeric parts of the Compose API:

```tsx
<MaterialToolbar.Root
  contentPadding={{ horizontal: 8, vertical: 4 }}
  expandedShadowElevation={6}
  collapsedShadowElevation={3}
/>
```

If omitted, Material's current `ContentPadding` and toolbar elevation defaults are used.

A generic React Native prop cannot represent arbitrary Compose `Shape` or `FiniteAnimationSpec` objects. Those remain native Material defaults rather than being approximated with a custom JS abstraction.

## Icons and images

`MaterialToolbar.Icon` accepts:

- `resource="ic_home"`: Android drawable/mipmap resource (including Vector Drawable / Material Symbol XML), rendered with Compose `Icon` when tinted;
- `source={require('./icon.png')}`: bundled React Native image rendered through Coil;
- `source={{ uri: 'https://...' }}`: URI supported by Coil;
- `tint="content" | "none"`;
- `size` in dp.

Arbitrary React Native views are not embedded inside the Compose content slot. Doing that would require a different RN-host-inside-Compose architecture with different layout and lifecycle behavior.

## Visibility, expansion and keyboard

The complete host supports animated `visible`. `expanded` is passed to the native toolbar. The imperative ref exposes:

```ts
show();
hide();
expand();
collapse();
```

`imeBehavior="hide"` hides the native toolbar while the IME is visible, so this behavior does not need a JS keyboard subscription.

## Navigation usage

The module can still be used as the visual control that changes React Navigation / Expo Router routes, but navigation selection remains application state, not `FloatingToolbar` state. Use each button's `onPress`; when a native visual indicator is useful, set the bridge-level `selected` prop on the real Material3 `TextButton` / `IconButton`. The bridge does not synthesize tab roles, values, or selection callbacks.

## Native scroll interop

The current architecture is source-owned. React Native owns touch handling, fling physics, source movement and content position. Native Material chrome participates in the actual Android nested-scroll transaction; the parent does not run a second scroller and does not reconstruct momentum from sampled `scrollY`.

A movement follows the real transaction:

```text
source asks dy
 -> parent pre-scroll
 -> source scrolls its remainder itself
 -> parent post-scroll receives real childConsumed / dyUnconsumed
```

Accounting remains:

```text
requested = chromePre + childConsumed + chromePost + remaining
```

`MaterialTopAppBar` is a real pre/post consumer. `MaterialToolbar` / FloatingToolbar observes the same transaction and consumes zero list distance for its own behavior.

The production host intentionally fails closed if it cannot identify exactly one supported RN vertical source for the screen/transaction.

## TopAppBar

The package includes `MaterialTopAppBar` as a second native Material consumer:

```tsx
import { MaterialTopAppBar } from 'expo-material-toolbar';

<MaterialTopAppBar
  title="Native scroll"
  variant="medium"
  scrollBehavior="exitUntilCollapsed"
  themeMode="system"
/>
```

Available variants are `small | medium | large`; scroll behaviors are `none | enterAlways | exitUntilCollapsed`.

## RN 0.86 compatibility

The RN 0.86 compatibility layer is intentionally narrow and implemented through the Expo config plugin documented in [`docs/RN086_ANDROIDX_COMPAT.md`](docs/RN086_ANDROIDX_COMPAT.md).

It does three relevant things:

1. enables the required ReactAndroid/Hermes source-build substitutions for the supported Expo consumer path;
2. selects RN 0.86's existing `ReactNestedScrollViewManager` for vertical `RCTScrollView` through both `MainReactPackage.kt` manager creation paths;
3. changes only the ordinary non-paging `ReactNestedScrollView.fling()` path from direct reflected-scroller invocation to `super.fling(correctedVelocityY)`.

The plugin is RN 0.86.x-only, validates expected source shape, is idempotent and fails closed. It does not implement the shared transport, consumers, chrome behavior or a second momentum model.

The validated RN 0.86 behavioral claim is standard non-paging vertical scrolling. See the handoff/checkpoint documents for the exact proven matrix.

## RN 0.87+ and upstream

RN 0.87+ is the established architecture line rather than a from-scratch next step. The repository contains frozen multi-consumer, source-boundary, shared-ledger, dispatcher and lifecycle checkpoints.

The narrow React Native source issue is upstream PR `react/react-native#57972`: the generated nested ScrollView inherits AndroidX nested-scroll machinery but its ordinary fling override bypasses `NestedScrollView.fling()`. The proposal changes the generator and regenerated nested class so ordinary nested flings enter AndroidX's NON_TOUCH lifecycle without changing `ReactScrollView` or the specialized paging/snap branch.

See [`docs/production-readiness-rn087.md`](docs/production-readiness-rn087.md) for covered versus remaining regression gates.

## Android dependency

```gradle
implementation 'androidx.compose.material3:material3:1.5.0-alpha17'
```

Kotlin/Gradle changes require a new development build:

```powershell
npx expo run:android
```

## Overlay touch routing

`MaterialToolbar.Root` is an overlay by default. If you do not pass `style`, the React wrapper uses an absolute fill host so Compose receives the full screen bounds needed by Material placement and `WindowInsets.safeDrawing`.

The Android host implements React Native `ReactPointerEventsView` and exposes BOX_NONE semantics for the overlay host. Only toolbar/FAB child bounds are interactive; touches elsewhere continue to lower React Native siblings.

## Navigation-style selected action

`FloatingToolbar` itself does not expose a selected-item or tab API. For apps that use the toolbar as a navigation shell, the bridge exposes a visual-only `selected` state on `TextButton` and `IconButton`. It does not add `Role.Tab`.

```tsx
<MaterialToolbar.Root
  colors={{
    selectedContainer: theme.colors.chrome.tabIndicator,
    selectedContent: theme.colors.text.primary,
    unselectedContent: theme.colors.text.secondary,
  }}
>
  <MaterialToolbar.Content>
    <MaterialToolbar.TextButton
      id="home"
      selected={selectedTab === 'index'}
      onPress={() => router.navigate('/')}
    >
      <MaterialToolbar.Icon source={require('./home.png')} />
      <MaterialToolbar.Text>Home</MaterialToolbar.Text>
    </MaterialToolbar.TextButton>
  </MaterialToolbar.Content>
</MaterialToolbar.Root>
```

The selected `TextButton` remains a real Material3 Compose `TextButton`; its native container color becomes the active indicator.
