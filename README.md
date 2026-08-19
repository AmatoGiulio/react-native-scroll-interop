# react-native-scroll-interop

Android-native scroll interoperability for React Native.

The package exposes the real synchronous Android nested-scroll transaction to native UI consumers while React Native remains the owner of touch handling, source position and fling physics.

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native UI consumers
```

There is no per-frame JavaScript `onScroll` transport, sampled `scrollY` momentum reconstruction, parent-owned scroller, or parent `scrollBy` / `scrollTo` used to move the React Native source.

Current package version:

```text
react-native-scroll-interop@0.1.0-alpha.1
```

## Public surface

Root import:

```ts
import {
  MaterialToolbar,
  MaterialTopAppBar,
  NativeScrollHost,
} from 'react-native-scroll-interop';
```

Optional Expo Router adapter:

```ts
import { Stack } from 'react-native-scroll-interop/router';
```

The root package exports the three components above plus their public TypeScript types. The `/router` entry is the only JavaScript surface that imports Expo Router.

## Compatibility

The package manifest currently declares:

| Dependency / platform | Current contract |
|---|---|
| React Native | `>=0.86.0 <0.88.0` — RN 0.86.x and RN 0.87.x |
| Expo module runtime | `*`; the core package does not pin an Expo SDK line |
| Expo Router | `>=57.0.0 <58.0.0`, optional unless `/router` is imported |
| react-native-screens | `>=4.26.0 <4.27.0`, optional unless direct screen ownership is enabled |
| react-native-safe-area-context | `>=5.0.0 <6.0.0` |
| Android | native Material3 and nested-scroll implementation |
| iOS / web | safe fallback/no-op Material surfaces; Expo Router options pass through |

The Expo peer follows the normal Expo-module contract and is intentionally separate from the narrower Expo Router adapter certification. The repository Router example is Expo SDK 57 / RN 0.86.

### React Native 0.86.x

`reactNativeScrollCompat` patches the RN 0.86 Java `ReactNestedScrollView` source and both `MainReactPackage` ScrollView manager creation paths. Ordinary non-paging fling delegates to AndroidX `NestedScrollView.fling()`; paging/snap remains on React Native's existing branch.

### React Native 0.87.x

The same `reactNativeScrollCompat` option patches the RN 0.87 Kotlin `ReactNestedScrollView` source and the same two `MainReactPackage` manager creation paths. Ordinary non-paging fling delegates to AndroidX `NestedScrollView.fling()`; paging/snap remains on React Native's existing branch.

Both RN lines therefore use the same ownership model: React Native starts and owns the fling, while AndroidX supplies the real typed nested-scroll lifecycle consumed by this package.

RN 0.87 support is part of the package compatibility layer and has its own release gate. It does not imply that an arbitrary Expo SDK can be paired with an arbitrary React Native version.

## Expo config plugin

For Android navigation-first integration:

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-scroll-interop",
        {
          "android": {
            "reactNativeScrollCompat": true,
            "reactNativeScreensInterop": true
          }
        }
      ]
    ]
  }
}
```

`reactNativeScrollCompat`:

- accepts only RN 0.86.x and 0.87.x;
- enables building ReactAndroid from the installed source tree;
- selects `ReactNestedScrollViewManager` at both RN manager entry points;
- applies the version-specific ordinary-fling source patch;
- is idempotent and fails closed when the expected source shape changes;
- currently requires generated `android/settings.gradle` to use Groovy.

`reactNativeScreensInterop`:

- accepts only `react-native-screens 4.26.x`;
- patches `android/src/main/java/com/swmansion/rnscreens/Screen.kt`;
- makes that native screen a `NestedScrollingParent3` owner;
- delegates nested-scroll callbacks to `ReactNativeNestedScrollParentController`;
- prepares the screen-owned React Native vertical scroll source directly;
- injects the Gradle dependency on `:react-native-scroll-interop`;
- is idempotent and fails closed when the certified source shape changes.

For standalone `NativeScrollHost`, `reactNativeScreensInterop` is not required.

Because this package contains native Android code, use a native development/build workflow. Expo Go does not contain this module.

## Navigation-first Expo Router API

`react-native-scroll-interop/router` wraps the existing Expo Router `Stack`; it does not create a navigator or duplicate navigation state.

```tsx
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { MaterialToolbar } from 'react-native-scroll-interop';
import { Stack } from 'react-native-scroll-interop/router';

export default function Layout() {
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: 'Home',
            headerLargeTitle: true,
          }}
        />

        <Stack.Screen
          name="details"
          options={{
            title: 'Details',
            material3: {
              topAppBar: {
                variant: 'medium',
                scrollBehavior: 'enterAlways',
              },
            },
          }}
        />
      </Stack>

      <MaterialToolbar.Root
        placement="bottom"
        scrollBehavior="exitAlways"
        insets="none"
      >
        <MaterialToolbar.Content>
          <MaterialToolbar.TextButton
            id="home"
            accessibilityLabel="Home"
            onPress={() => router.replace('/')}
          >
            <MaterialToolbar.Text>Home</MaterialToolbar.Text>
          </MaterialToolbar.TextButton>
        </MaterialToolbar.Content>
      </MaterialToolbar.Root>
    </View>
  );
}
```

A screen remains normal React Native scroll content:

```tsx
import { ScrollView } from 'react-native';

export default function Screen() {
  return <ScrollView>{/* content */}</ScrollView>;
}
```

On the certified `react-native-screens` path, the screen does not need `NativeScrollHost`.

### Android Stack translation

On Android the adapter maps:

- `title` or a string `headerTitle` to the Material TopAppBar title;
- `headerLargeTitleEnabled: true` or `headerLargeTitle: true` to a large TopAppBar;
- a large TopAppBar to `exitUntilCollapsed` unless `material3.topAppBar.scrollBehavior` overrides it;
- native-stack back availability to `navigationIcon="back"` and the existing `navigation.goBack()`;
- `headerBackVisible: false` to no Material back affordance;
- `material3.topAppBar` to Material-only TopAppBar options;
- `material3.topAppBar: false` to the platform-native header.

Material-only navigation options are:

```ts
type Material3TopAppBarNavigationOptions = {
  variant?: 'small' | 'medium' | 'large';
  scrollBehavior?: 'none' | 'enterAlways' | 'exitUntilCollapsed';
  themeMode?: 'system' | 'light' | 'dark';
  dynamicColor?: boolean;
  navigationAccessibilityLabel?: string;
};
```

The adapter falls back to the platform-native header instead of silently dropping unsupported custom header behavior. That fallback is used for functional `headerTitle`, explicit `headerTransparent: false`, custom left/right items, header background/search/back icon, header style/tint/title style/alignment and header shadow configuration.

On iOS and web, the adapter removes the `material3` namespace and otherwise forwards Expo Router's existing stack options.

Expo Router static APIs are preserved through the wrapped `Stack` object.

## `MaterialTopAppBar`

Public props:

```ts
type MaterialTopAppBarProps = {
  title: string;
  visible?: boolean;
  variant?: 'small' | 'medium' | 'large';
  scrollBehavior?: 'none' | 'enterAlways' | 'exitUntilCollapsed';
  navigationIcon?: 'none' | 'back';
  navigationAccessibilityLabel?: string;
  onNavigationPress?: () => void;
  placement?: 'overlay' | 'header';
  themeMode?: 'system' | 'light' | 'dark';
  dynamicColor?: boolean;
  style?: StyleProp<ViewStyle>;
};
```

Android defaults:

```text
visible                      true
variant                      medium
scrollBehavior               none
navigationIcon               none
navigationAccessibilityLabel Back
placement                    overlay
themeMode                    system
dynamicColor                 false
```

`placement="overlay"` absolutely positions the app bar at the top.

`placement="header"` keeps it in normal layout flow and owns the top safe-area inset plus the expanded Material height used by the current implementation:

```text
small   64
medium 112
large  152
```

On non-Android platforms `MaterialTopAppBar` returns `null`.

## `MaterialToolbar`

Compound API:

```text
MaterialToolbar.Root
MaterialToolbar.Content
MaterialToolbar.LeadingContent
MaterialToolbar.TrailingContent
MaterialToolbar.IconButton
MaterialToolbar.TextButton
MaterialToolbar.Icon
MaterialToolbar.Text
MaterialToolbar.Fab
```

Root options are defined by `MaterialToolbarRootProps`. The current Android defaults are:

```text
expanded        true
visible         true
orientation     horizontal
scrollBehavior  none
variant         standard
themeMode       system
dynamicColor    false
imeBehavior     none
placement       bottom
insets          safe
FAB position    end when horizontal, bottom when vertical
```

`placement` accepts `top | center | bottom` and maps to `topCenter | center | bottomCenter` unless `alignment` is supplied.

`alignment` accepts:

```text
topStart | topCenter | topEnd
centerStart | center | centerEnd
bottomStart | bottomCenter | bottomEnd
```

`scrollBehavior` accepts `none | exitAlways`. The native FloatingToolbar behavior observes real child-consumed POST distance and consumes zero source distance.

When no `style` is provided on Android, `MaterialToolbar.Root` uses `StyleSheet.absoluteFill`.

Imperative ref:

```ts
type MaterialToolbarRef = {
  show(): Promise<void>;
  hide(): Promise<void>;
  expand(): Promise<void>;
  collapse(): Promise<void>;
};
```

On non-Android platforms the toolbar renders nothing and those ref methods resolve as no-ops.

## `NativeScrollHost`

Standalone/fallback usage:

```tsx
import { NativeScrollHost } from 'react-native-scroll-interop';
import { ScrollView } from 'react-native';

<NativeScrollHost style={{ flex: 1 }}>
  <ScrollView>{/* content */}</ScrollView>
</NativeScrollHost>
```

On Android it renders the native nested-scroll parent, discovers one supported vertical source and delegates transaction ownership to `ReactNativeNestedScrollParentController`.

On non-Android platforms it is a normal React Native `View` wrapper.

Do not add it around normal navigation screens when `reactNativeScreensInterop` owns the native screen parent.

## Transaction ownership

For a vertical nested-scroll request:

```text
requested dy
  -> PRE consumers
  -> React Native source moves the remainder
  -> POST consumers
  -> POST observers
  -> remaining
```

The conservation invariant is:

```text
requested = preConsumed + childConsumed + postConsumed + remaining
```

`MaterialTopAppBar` participates as a PRE/POST consumer. `MaterialToolbar` observes child-consumed POST distance and does not consume list distance.

## Repository layout

The maintained repository surface is intentionally small:

```text
android/          Expo/native Android integration + Material3 consumers
android-shared/   neutral nested-scroll core + RN source compatibility boundary
plugin/           config-plugin source patches
src/              public React Native components/types
scripts/          invariant/release gates
example/          navigation-first + standalone smoke app
```

Historical probes and research documents are intentionally kept in Git history rather than the active tree.

## Validation

Run the full static/package gate:

```bash
npm run check
```

It verifies:

- scroll ownership and conservation invariants;
- Material3 adapter boundaries;
- navigation API shape;
- RN 0.86.x and RN 0.87.x compatibility patch shapes;
- `react-native-screens 4.26.x` patch shape;
- npm tarball contents.

The repository example is the RN 0.86 / Expo Router runtime smoke test. Release validation also requires an exact-tarball RN 0.87 native consumer gate.

## Package contents

The npm allowlist contains only runtime/plugin sources and entry files. npm adds `README.md`, `LICENSE` and `package.json` to the tarball. Example code, scripts, CI configuration, architecture/release notes and generated Android build output are excluded.

## License

MIT.
