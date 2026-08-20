# react-native-scroll-interop

Android-native scroll interoperability for React Native.

`react-native-scroll-interop` exposes the real synchronous Android nested-scroll transaction to native UI consumers while React Native remains the owner of touch handling, source position and fling physics.

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native UI consumers
```

The transport does not use per-frame JavaScript `onScroll`, sampled `scrollY` momentum reconstruction, a parent-owned scroller, or parent `scrollBy` / `scrollTo` calls to move the React Native source.

Current package version:

```text
react-native-scroll-interop@0.1.0-alpha.1
```

The source is ready on GitHub. npm publication is intentionally deferred until the final public-package checks are completed from the documentation-frozen commit.

## Compatibility

| Target | Current status |
|---|---|
| Expo SDK 57 + React Native 0.86.x | **Certified**: exact package artifact, clean prebuild, x86_64 Android build and development runtime, navigation-first Material runtime |
| bare React Native 0.87.0-rc.3 | **Certified**: exact package artifact, standard RN autolinking, shipped bare compatibility adapter, ReactAndroid source build, x86_64 Android build/install, Hermes launch, `NativeScrollHost` + `MaterialTopAppBar` touch/fling runtime |
| Expo + React Native 0.87 | **Not claimed yet**: wait for an officially supported Expo/RN pairing |
| Android | Standard React Native native package, nested-scroll transport and Material3 UI consumers |
| iOS / web | Safe fallback/no-op Material surfaces; Router options pass through |

The package manifest declares:

| Dependency | Contract |
|---|---|
| React Native | `>=0.86.0 <0.87.0 || >=0.87.0-rc.3 <0.88.0` |
| Expo module runtime | not required |
| Expo Router | `>=57.0.0 <58.0.0`, optional unless `/router` is imported |
| react-native-screens | `>=4.26.0 <4.27.0`, optional unless direct screen ownership is enabled |
| react-native-safe-area-context | `>=5.0.0 <6.0.0` |

### React Native 0.86.x

The certified Expo integration target is Expo SDK 57 with RN 0.86.x. `reactNativeScrollCompat` patches the RN 0.86 Java `ReactNestedScrollView` ordinary non-paging fling path and both `MainReactPackage` ScrollView manager creation paths. Ordinary fling delegates to AndroidX `NestedScrollView.fling()` while paging/snap stays on React Native's existing branch.

### React Native 0.87.x

The compatibility patcher also supports the RN 0.87 Kotlin source shape. The current bare-host certification was completed on `react-native@0.87.0-rc.3`: package installation without Expo, standard React Native autolinking, the shipped bare compatibility adapter, ReactAndroid source-build wiring, the RN 0.87 unified prebuilt-Hermes metadata path, x86_64 Android build/install, Hermes launch, `NativeScrollHost`, `MaterialTopAppBar`, touch scrolling, inertial fling, reverse fling and TopAppBar collapse/expand all passed.

The Android native runtime and Material view managers use the standard React Native package boundary and do not require Expo Modules. Expo remains an optional host integration path through the config plugin and `/router` adapter. This alpha does not claim an Expo + RN 0.87 pairing until Expo officially supports that line.

## Public surface

Root values:

```ts
import {
  MaterialToolbar,
  MaterialTopAppBar,
  NativeScrollHost,
} from 'react-native-scroll-interop';
```

Root type exports:

```text
NativeScrollHostProps
MaterialToolbarAlignment
MaterialToolbarColors
MaterialToolbarContentProps
MaterialToolbarFabPosition
MaterialToolbarFabShape
MaterialToolbarFabProps
MaterialToolbarIconButtonProps
MaterialToolbarIconProps
MaterialToolbarImeBehavior
MaterialToolbarInsets
MaterialToolbarLeadingContentProps
MaterialToolbarOrientation
MaterialToolbarPlacement
MaterialToolbarRef
MaterialToolbarRootProps
MaterialToolbarScrollBehavior
MaterialToolbarScrollExitDirection
MaterialToolbarTextButtonProps
MaterialToolbarTextProps
MaterialToolbarThemeMode
MaterialToolbarTrailingContentProps
MaterialToolbarVariant
MaterialTopAppBarNavigationIcon
MaterialTopAppBarPlacement
MaterialTopAppBarProps
MaterialTopAppBarScrollBehavior
MaterialTopAppBarVariant
```

Optional Expo Router adapter:

```ts
import { Stack } from 'react-native-scroll-interop/router';
```

`/router` also exports:

```text
Material3TopAppBarNavigationOptions
Material3StackNavigationOptions
MaterialStackNavigationOptions
MaterialStackScreenOptions
MaterialStackScreenProps
MaterialStackProps
```

The `/router` entry is the only JavaScript surface that imports Expo Router.

## Bare React Native compatibility adapter

A standard Community React Native host can enable the validated ReactAndroid source compatibility path without Expo:

```bash
node ./node_modules/react-native-scroll-interop/plugin/bareReactNativeScrollCompat.js
```

The bare adapter:

- accepts only RN 0.86.x and 0.87.x source shapes;
- requires the standard Community `com.facebook.react.settings` / `autolinkLibrariesFromCommand()` settings shape;
- adds an idempotent ReactAndroid-only source composite substitution;
- keeps Hermes on React Native's prebuilt Android artifact path;
- uses the RN-selected Hermes metadata model for the active RN line;
- creates the validated Windows Gradle source-build placeholder when required;
- selects `ReactNestedScrollViewManager` at both RN manager entry points;
- applies the version-specific ordinary-fling source patch;
- leaves paging/snap on React Native's existing branch;
- fails closed on partial, conflicting or unrecognized source-build shapes.

The package itself is registered through standard React Native autolinking via `ReactNativeScrollInteropPackage`.

## Expo config plugin

Navigation-first Android integration:

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
- builds ReactAndroid from the installed source tree;
- selects `ReactNestedScrollViewManager` at both RN manager entry points;
- applies the version-specific ordinary-fling source patch;
- leaves paging/snap on React Native's existing branch;
- keeps Hermes on the prebuilt Android artifact path;
- is idempotent and fails closed when the expected source shape changes.

`reactNativeScreensInterop`:

- accepts only `react-native-screens 4.26.x`;
- patches `android/src/main/java/com/swmansion/rnscreens/Screen.kt`;
- makes the native screen a `NestedScrollingParent3` owner;
- delegates nested-scroll callbacks to `ReactNativeNestedScrollParentController`;
- binds the screen-owned React Native vertical source directly;
- injects the Gradle dependency on `:react-native-scroll-interop`;
- is idempotent and fails closed when the certified source shape changes.

For standalone `NativeScrollHost`, `reactNativeScreensInterop` is not required.

Because the package contains native Android code, use a native development/build workflow. Expo Go does not contain this native package.

## Navigation-first Expo Router API

`react-native-scroll-interop/router` wraps Expo Router's existing `Stack`; it does not create a navigator or duplicate navigation state.

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

Screens remain ordinary React Native scroll content:

```tsx
import { ScrollView } from 'react-native';

export default function Screen() {
  return <ScrollView>{/* content */}</ScrollView>;
}
```

On the certified `react-native-screens` path, page components do not need `NativeScrollHost`.

### Android Stack translation

On Android the adapter maps:

- `title` or a string `headerTitle` to the Material TopAppBar title;
- `headerLargeTitleEnabled: true` or `headerLargeTitle: true` to a large TopAppBar;
- a large TopAppBar to `exitUntilCollapsed` unless `material3.topAppBar.scrollBehavior` overrides it;
- native-stack back availability to `navigationIcon="back"` and the existing `navigation.goBack()`;
- `headerBackVisible: false` to no Material back affordance;
- `material3.topAppBar` to Material-only TopAppBar options;
- `material3.topAppBar: false` to the platform-native header.

```ts
type Material3TopAppBarNavigationOptions = {
  variant?: 'small' | 'medium' | 'large';
  scrollBehavior?: 'none' | 'enterAlways' | 'exitUntilCollapsed';
  themeMode?: 'system' | 'light' | 'dark';
  dynamicColor?: boolean;
  navigationAccessibilityLabel?: string;
};

type Material3StackNavigationOptions = {
  topAppBar?: false | Material3TopAppBarNavigationOptions;
};
```

`MaterialStackNavigationOptions`, `MaterialStackScreenOptions`, `MaterialStackScreenProps` and `MaterialStackProps` inherit the corresponding Expo Router `Stack` types while adding the `material3` namespace.

Unsupported custom header behavior falls back to the platform-native header instead of silently losing behavior. On iOS and web, the adapter removes the `material3` namespace and otherwise forwards Expo Router's existing stack options. Expo Router static APIs are preserved through the wrapped `Stack` object.

## `MaterialTopAppBar`

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

`placement="overlay"` positions the app bar at the top. `placement="header"` keeps it in normal layout flow and owns the top safe-area inset plus the expanded Material height:

```text
small   64
medium 112
large  152
```

On non-Android platforms `MaterialTopAppBar` returns `null`.

## `MaterialToolbar`

Compound values:

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

Core public types and members:

```ts
type MaterialToolbarRootProps = {
  children?: ReactNode;
  expanded?: boolean;
  visible?: boolean;
  orientation?: 'horizontal' | 'vertical';
  scrollBehavior?: 'none' | 'exitAlways';
  scrollExitDirection?: 'top' | 'bottom' | 'start' | 'end';
  variant?: 'standard' | 'vibrant';
  themeMode?: 'system' | 'light' | 'dark';
  dynamicColor?: boolean;
  imeBehavior?: 'none' | 'hide';
  placement?: 'top' | 'center' | 'bottom';
  alignment?:
    | 'topStart' | 'topCenter' | 'topEnd'
    | 'centerStart' | 'center' | 'centerEnd'
    | 'bottomStart' | 'bottomCenter' | 'bottomEnd';
  insets?: 'none' | 'safe';
  edgeOffset?: number;
  contentPadding?: number | {
    horizontal?: number;
    vertical?: number;
    start?: number;
    top?: number;
    end?: number;
    bottom?: number;
  };
  expandedShadowElevation?: number;
  collapsedShadowElevation?: number;
  floatingActionButtonPosition?: 'start' | 'end' | 'top' | 'bottom';
  colors?: MaterialToolbarColors;
  style?: StyleProp<ViewStyle>;
};

type MaterialToolbarColors = {
  toolbarContainer?: ColorValue;
  toolbarContent?: ColorValue;
  fabContainer?: ColorValue;
  fabContent?: ColorValue;
  selectedContainer?: ColorValue;
  selectedContent?: ColorValue;
  unselectedContent?: ColorValue;
};

type MaterialToolbarContentProps = { children?: ReactNode };
type MaterialToolbarLeadingContentProps = { children?: ReactNode };
type MaterialToolbarTrailingContentProps = { children?: ReactNode };

type MaterialToolbarButtonCommonProps = {
  children?: ReactNode;
  id?: string;
  enabled?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
  selected?: boolean;
};

type MaterialToolbarIconButtonProps = MaterialToolbarButtonCommonProps;
type MaterialToolbarTextButtonProps = MaterialToolbarButtonCommonProps;

type MaterialToolbarIconProps = {
  source?: ImageSourcePropType;
  resource?: string;
  tint?: 'content' | 'none';
  size?: number;
  fallback?: 'initial' | 'none';
};

type MaterialToolbarTextProps = {
  children: string;
};

type MaterialToolbarFabProps = {
  children?: ReactNode;
  accessibilityLabel?: string;
  onPress?: () => void;
  shape?: 'default' | 'circle';
};

type MaterialToolbarRef = {
  show(): Promise<void>;
  hide(): Promise<void>;
  expand(): Promise<void>;
  collapse(): Promise<void>;
};
```

Named value types are `MaterialToolbarOrientation`, `MaterialToolbarVariant`, `MaterialToolbarImeBehavior`, `MaterialToolbarThemeMode`, `MaterialToolbarInsets`, `MaterialToolbarPlacement`, `MaterialToolbarScrollBehavior`, `MaterialToolbarScrollExitDirection`, `MaterialToolbarAlignment`, `MaterialToolbarFabPosition` and `MaterialToolbarFabShape`.

Current Android defaults:

```text
expanded                    true
visible                     true
orientation                 horizontal
scrollBehavior              none
scrollExitDirection         inferred natively
variant                     standard
themeMode                   system
dynamicColor                false
imeBehavior                 none
placement                   bottom
alignment                   derived from placement
insets                      safe
floatingActionButtonPosition end (horizontal) / bottom (vertical)
```

`alignment` takes precedence over `placement`. `contentPadding`, `edgeOffset`, `expandedShadowElevation` and `collapsedShadowElevation` use dp. `scrollBehavior="exitAlways"` observes child-consumed POST distance and consumes zero list distance.

## `NativeScrollHost`

`NativeScrollHostProps` is `PropsWithChildren<ViewProps>`.

```tsx
import { NativeScrollHost } from 'react-native-scroll-interop';
import { ScrollView } from 'react-native';

<NativeScrollHost style={{ flex: 1 }}>
  <ScrollView>{/* content */}</ScrollView>
</NativeScrollHost>
```

On Android it renders the native nested-scroll parent, discovers one supported vertical source and delegates transaction ownership to `ReactNativeNestedScrollParentController`. On non-Android platforms it is a normal React Native `View` wrapper.

Do not add it around normal navigation screens when `reactNativeScreensInterop` owns the native screen parent.

## Transaction ownership

```text
requested dy
  -> PRE consumers
  -> React Native source moves the remainder
  -> POST consumers
  -> POST observers
  -> remaining
```

Conservation:

```text
requested = preConsumed + childConsumed + postConsumed + remaining
```

`MaterialTopAppBar` is a PRE/POST consumer. `MaterialToolbar` observes child-consumed POST distance and does not consume list distance.

## Repository layout

```text
android/   standard React Native Android runtime: neutral core, RN boundary and Material3 view managers
plugin/    fail-closed RN, bare-host and react-native-screens source compatibility adapters
src/       public React Native components and types
scripts/   invariant and package gates
example/   navigation-first + standalone smoke app
```

Neutral core:

```text
android/src/main/java/com/reactnativescroll/interop/core/
```

React Native boundary:

```text
android/src/main/java/com/reactnativescroll/interop/reactnative/
```

## Validation

Static/package gate:

```bash
npm run check
npm pack --dry-run
```

The current alpha certification matrix is:

```text
Expo SDK 57 + RN 0.86.x
  package / clean prebuild / ReactAndroid source build / x86_64 Android build / Material navigation runtime   PASS

bare RN 0.87.0-rc.3
  package / no-Expo install / bare adapter / ReactAndroid source build / x86_64 build+install / Hermes / NativeScrollHost + MaterialTopAppBar runtime   PASS

Expo + RN 0.87
  not claimed until an officially supported pairing exists
```

Before npm publication, a fresh final tarball must be generated after the documentation freeze and its complete static/package surface and publish dry-run must pass again. Runtime/device gates need to be repeated only if runtime, plugin, dependency metadata or another packaged source changes.

## Package contents

The npm allowlist contains the Android runtime tree plus plugin and JavaScript entry sources. npm also adds `README.md`, `LICENSE` and `package.json`. Example code, scripts, workflow configuration, architecture/release notes and generated Android build output are excluded.

## License

MIT.
