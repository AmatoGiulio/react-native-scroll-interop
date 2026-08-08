# expo-material-toolbar

Android-only native module that bridges Material 3 Compose floating toolbars and top app bars to
React Native — including their real scroll behaviour, driven natively rather than from a JavaScript
`onScroll` handler.

This branch targets Expo SDK 55 / React Native 0.83 and
`androidx.compose.material3:material3:1.5.0-alpha17`, and intentionally follows the current Compose
toolbar model instead of implementing a tab/navigation component inside the toolbar.

## Install

```bash
npm install expo-material-toolbar
```

**Expo** apps need nothing further: the module is picked up by expo-modules-autolinking and the
views are registered by `ExpoMaterialToolbarModule`.

**Bare React Native** apps are supported too. `react-native.config.js` autolinks
`com.materialtoolbar.rn.MaterialToolbarPackage`, which registers the same views through plain
`ViewManager`s. Expo is an optional peer dependency; nothing in the Android library's `src/main`
imports `expo.modules`, and the Expo binding lives in a separate source set that is only compiled
when the Expo Gradle plugin is present.

Either way the JavaScript API is identical — `src/native/requireToolbarView.ts` resolves whichever
binding the app actually has.

## Try it

```bash
cd example && npx expo run:android
```

The example is shaped like a real app on purpose: three bottom tabs mounted at once, a FlashList
image grid, a FlashList feed, and a plain `ScrollView` screen, each with a different Material scroll
behaviour. See [TESTING.md](TESTING.md) for the validation matrix and
[ARCHITECTURE.md](ARCHITECTURE.md) for how the scroll interop works.

## What is native Compose

`Root` hosts one Compose view. The actual toolbar is one of:

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

`MaterialToolbar.Root scrollBehavior="exitAlways"` uses a native RN scroll coordinator. Standard React Native Android `ScrollView` and FlashList 2's default RN scroller can drive the real Material3 FloatingToolbar state without adding a toolbar-specific JS `onScroll`, list ref, or per-screen wrapper.

Alpha.17 also includes a deliberately minimal second consumer, `MaterialTopAppBar`, to prove that the transport is not FloatingToolbar-specific:

```tsx
import { MaterialTopAppBar } from 'expo-material-toolbar';

<MaterialTopAppBar
  title="Native scroll PoC"
  variant="medium"
  scrollBehavior="exitUntilCollapsed"
  themeMode="system"
/>
```

Available PoC variants are `small | medium | large`; scroll behaviors are `none | enterAlways | exitUntilCollapsed`. The TopAppBar itself is the real Material3 Compose component. The React API is intentionally small in alpha.24 because its purpose is to validate the shared native-scroll primitive before expanding the component surface.

### TopAppBar PoC content inset

For `enterAlways` / `exitUntilCollapsed`, alpha.24 measures the real expanded Compose TopAppBar host and applies that value through React Native 0.83's native scroll-away top-padding path on the selected `ReactScrollView`. The embedded Compose host reads the Android root-window `systemBars + displayCutout` geometry and passes those physical insets explicitly to Material3, avoiding the missing-status-bar case that can occur when React Native has already consumed Compose's default inset chain. Do not add a duplicated `contentContainerStyle.paddingTop` such as `safeAreaTop + 112` for this PoC. The RN content translation and Material collapse range share the same native scroll coordinate so the list rises with the app bar and continues normally once the collapse limit is reached. RN's required scroll-range padding remains non-clipping, so it does not appear as a blank strip at the bottom.

The React Native API used here is explicitly unstable and assumes the library has control of the ScrollView content translation. It is isolated inside the RN source adapter; it is evidence for the required screen/scroll geometry primitive, not the intended long-term public API.


The RN transport is now shared between mounted consumers. When a visible FloatingToolbar and TopAppBar belong to the same Fabric surface, one sampled native scroll source is fanned out to both Material consumers.

## Android dependency

```gradle
implementation 'androidx.compose.material3:material3:1.5.0-alpha17'
```

Kotlin/Gradle changes require a new development build:

```powershell
npx expo run:android
```

### Automatic overlay host

`MaterialToolbar.Root` is an overlay by default. If you do not pass `style`, the React wrapper uses an absolute fill host so Compose receives the full screen bounds needed by Material placement and `WindowInsets.safeDrawing`. You therefore do not need `useSafeAreaInsets()` just to position the toolbar.

The Android host only accepts touch sequences that start inside the measured floating toolbar/FAB bounds; touches elsewhere fall through to the React Native screen underneath. Pass an explicit `style` only when you intentionally want custom host bounds.



## IconButton labels and circular FABs

`MaterialToolbar.IconButton` maps to Material3 `IconButton`. The `<MaterialToolbar.Text>`
child is useful as an accessibility/fallback label but is not drawn as a navigation label.
For an action that visibly contains both icon and text, use `TextButton`:

```tsx
<MaterialToolbar.TextButton id="home" onPress={openHome}>
  <MaterialToolbar.Icon source={require('./home.png')} />
  <MaterialToolbar.Text>Home</MaterialToolbar.Text>
</MaterialToolbar.TextButton>
```

The attached FAB can keep the Material3 default shape or be explicitly circular:

```tsx
<MaterialToolbar.Fab shape="circle" onPress={openSearch}>
  <MaterialToolbar.Icon source={require('./search.png')} />
</MaterialToolbar.Fab>
```

The `circle` option maps directly to Compose `CircleShape`; the default maps to
`FloatingActionButtonDefaults.shape`.

## Overlay touch routing

With the default root style the React host fills its parent so native placement and
window insets can be automatic. The Android Compose child itself is wrap-content. On
Android the native Expo host also implements React Native `ReactPointerEventsView` and
exposes `pointerEvents = PointerEvents.BOX_NONE`; this is required for RN/Fabric hit-testing of custom
native ViewGroups. The JS host still sets `pointerEvents="box-none"` as a declarative
hint, but native BOX_NONE semantics are the authoritative path. As a result, only the
toolbar/FAB child bounds are interactive and touches elsewhere continue to lower RN
siblings.

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

## Native React Native scroll interop

On Android/RN 0.83, enable the real Material3 exit-always behavior directly on the toolbar:

```tsx
<MaterialToolbar.Root
  placement="bottom"
  expanded
  scrollBehavior="exitAlways"
>
  {/* content */}
</MaterialToolbar.Root>
```

No `onScroll`, list ref, or wrapper is required for React Native `ScrollView` and FlashList 2.0.2's default scroller. The module registers a native `ReactScrollViewHelper.ScrollListener` and forwards native scroll deltas into Material3's `FloatingToolbarScrollBehavior`. Use `scrollExitDirection` only when you do not want the direction inferred from `placement`/`alignment`. A custom FlashList `renderScrollComponent` that does not use React Native's Android `ReactScrollView` is outside this automatic path.

### Native scroll geometry note

Alpha.14 attempted to give Material3 a synthetic direct Compose parent large enough to calculate `offsetLimit`. Runtime logs showed that the RN scroll signal and Material state were already correct, but translating toolbar content inside a wrap-content Android `ComposeView` was the wrong boundary for an RN overlay. Alpha.15 instead computes the exit distance from the actual Android host geometry and translates the `ComposeView` itself while retaining Material3 `exitAlwaysScrollBehavior` as the offset/snap state engine.


### Native host translation (alpha.15)

For RN scroll interop, Material3 `exitAlwaysScrollBehavior` remains the state and snap engine, but its internal Compose movement modifier is not attached to the toolbar. The Expo module intentionally uses a wrap-content Android `ComposeView` so React Native content remains touchable outside the toolbar. Moving toolbar content beyond that Compose surface can be clipped or visually delayed. Alpha.15 therefore computes the Material state limit from the Android host geometry and applies `state.offset` to the `ComposeView` translation itself. No JS scroll callback, list ref, or wrapper is required.
