# react-native-scroll-interop

Android-native scroll interoperability primitives for React Native.

`react-native-scroll-interop` exposes the real synchronous Android nested-scroll transaction to native UI consumers while React Native remains the owner of touch handling, source position and fling physics. Material3 is the reference native consumer, not the transport core.

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

npm publication remains deferred until the final architecture-refactor Android gates pass from the documentation-frozen commit.

## Compatibility

| Target | Status |
|---|---|
| Expo SDK 57 + React Native 0.86.x | Previous release-candidate baseline passed package/prebuild/x86_64 build + Material navigation runtime; current controller/provider refactor requires final regression rerun |
| bare React Native 0.87.0-rc.3 | Previous release-candidate baseline passed package/autolinking/source build/x86_64 build+install/Hermes/NativeScrollHost + MaterialTopAppBar runtime; current controller/provider refactor requires final regression rerun |
| Expo + React Native 0.87 | Not claimed until an officially supported Expo/RN pairing is validated |
| Android | General RN nested-scroll transport with Material3 reference consumers |
| iOS / web | Safe fallback/no-op Material surfaces; navigation mapping passes through |

The package manifest declares:

| Dependency | Contract |
|---|---|
| React Native | `>=0.86.0 <0.87.0 || >=0.87.0-rc.3 <0.88.0` |
| Expo module runtime | not required |
| Expo Router | `>=57.0.0 <58.0.0`, optional unless `/router` is imported |
| React Navigation | no runtime/peer dependency; `/react-navigation` uses a structural native-stack option contract |
| react-native-screens | `>=4.26.0 <4.27.0`, optional unless direct screen ownership is enabled |
| react-native-safe-area-context | `>=5.0.0 <6.0.0` |

### Architecture at a glance

```text
neutral core
   |
React Native boundary
   |-- NativeScrollHost
   |-- ReactNativeScreenNestedScrollBridge
   |
neutral PRE / POST / observer ports
   |
Material3 reference participant provider

navigation options
   |
common Material3/navigation mapper
   |-- React Navigation adapter
   `-- Expo Router adapter
```

The neutral core has no Material3, Expo, navigation or concrete React Native ScrollView dependency. The RN controller sees only neutral participant ports. Material3 resolves/binds its own consumers above that boundary.

## React Native 0.86.x

The Expo integration target remains Expo SDK 57 with RN 0.86.x. `reactNativeScrollCompat` patches the RN 0.86 Java `ReactNestedScrollView` ordinary non-paging fling path and both `MainReactPackage` ScrollView manager creation paths. Ordinary fling delegates to AndroidX `NestedScrollView.fling()` while paging/snap stays on React Native's existing branch.

## React Native 0.87.x

The compatibility patcher also supports the RN 0.87 Kotlin source shape. The bare adapter uses standard React Native autolinking/source-build wiring and the RN 0.87 unified `HERMES_VERSION_NAME` prebuilt-Hermes metadata path.

The Android native runtime and Material view managers use the standard React Native package boundary and do not require Expo Modules. Expo remains an optional host integration through the config plugin and `/router` adapter.

## Public root surface

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

## Navigator-neutral Material3 mapping

The pure mapping entry point contains no Expo Router or React Navigation import:

```ts
import {
  resolveMaterial3Navigation,
  resolveMaterial3TopAppBarDescriptor,
  type Material3NavigationDecision,
  type Material3NavigationOptionBag,
  type Material3NavigationScope,
  type Material3StackNavigationOptions,
  type Material3TopAppBarDescriptor,
  type Material3TopAppBarNavigationOptions,
} from 'react-native-scroll-interop/navigation';
```

`resolveMaterial3Navigation` decides whether an adapter should pass options through, restore the navigator-native header, or render the Material3 reference header. `resolveMaterial3TopAppBarDescriptor` maps normalized route/header state to the `MaterialTopAppBar` descriptor. Neither function owns navigation state or scroll transport.

Shared option types:

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

`Material3NavigationOptionBag`, `Material3NavigationDecision`, `Material3NavigationScope` and `Material3TopAppBarDescriptor` are the navigator-neutral structural/decision types used by the adapters.

## React Navigation adapter

`/react-navigation` does not import `@react-navigation/*`; the application keeps ownership of its navigator and passes its native-stack-like option objects through the transformers.

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  material3NativeStackNavigatorOptions,
  material3NativeStackScreenOptions,
  type Material3ReactNavigationHeaderProps,
  type Material3ReactNavigationOptions,
} from 'react-native-scroll-interop/react-navigation';

const Stack = createNativeStackNavigator();

export function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={material3NativeStackNavigatorOptions({
        headerLargeTitle: true,
      })}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={material3NativeStackScreenOptions({
          title: 'Home',
          material3: {
            topAppBar: {
              variant: 'large',
              scrollBehavior: 'exitUntilCollapsed',
            },
          },
        })}
      />
    </Stack.Navigator>
  );
}
```

`Material3ReactNavigationOptions` is the structural option type consumed by the adapter. `Material3ReactNavigationHeaderProps` is the normalized native-stack header shape used internally by the generated Material header.

## Expo Router adapter

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

The adapter wraps Expo Router's existing `Stack`; it does not create a navigator or duplicate navigation state. All Material3 option semantics are delegated to the same navigator-neutral mapper used by the React Navigation adapter.

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

On Android the common mapper handles title, large-title variant/default scroll behavior, back availability, `material3.topAppBar`, native-header opt-out and unsupported-header fallback. On iOS/web it removes the `material3` namespace and otherwise passes navigator options through.

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

- accepts only the supported RN 0.86.x / certified 0.87 line;
- builds ReactAndroid from the installed source tree;
- selects `ReactNestedScrollViewManager` at both RN manager entry points;
- applies the version-specific ordinary-fling source patch;
- leaves paging/snap on React Native's existing branch;
- is idempotent and fails closed when the expected source shape changes.

`reactNativeScreensInterop`:

- accepts only `react-native-screens 4.26.x`;
- makes the native screen a `NestedScrollingParent3` owner;
- patches `Screen.kt` only to instantiate/forward to `ReactNativeScreenNestedScrollBridge`;
- keeps source discovery and transaction lifecycle inside the generic RN boundary;
- contains no Material3 or navigation-specific scroll logic;
- injects the Gradle dependency on `:react-native-scroll-interop`;
- is idempotent and fails closed when the certified source shape changes.

The neutral upstream replacement path is documented in `UPSTREAM_REACT_NATIVE_SCREENS.md` in the repository. The 4.26.x patcher remains the compatibility path until an equivalent upstream API is released and runtime-certified.

For standalone `NativeScrollHost`, `reactNativeScreensInterop` is not required.

Because the package contains native Android code, use a native development/build workflow. Expo Go does not contain this module.

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

On Android it renders the standard RN native nested-scroll parent, discovers one supported vertical source and delegates transaction ownership to `ReactNativeNestedScrollParentController`. On non-Android platforms it is a normal React Native `View` wrapper.

Do not add it around normal navigation screens when the screen/container bridge owns the native parent relationship.

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

`MaterialTopAppBar` is the reference PRE/POST consumer. `MaterialToolbar` observes child-consumed POST distance and does not consume list distance. The RN controller itself has no Material3 knowledge.

## Repository layout

```text
android/.../core/         neutral nested-scroll kernel
android/.../reactnative/  RN source/boundary, NativeScrollHost, screen bridge
android/.../material3/    Material3 reference consumers/provider/registry
plugin/                   RN and react-native-screens compatibility adapters
src/navigation/           navigator-neutral Material3 navigation mapping
navigation.ts             pure mapping entry point
react-navigation.tsx      thin React Navigation adapter
router.tsx                thin Expo Router adapter
src/                      public React Native components and types
scripts/                  architecture/invariant/package gates
example/                  navigation-first + standalone smoke app
```

The historical private Kotlin package `expo.modules.materialtoolbar` contains only Compose view implementation details in this alpha. No Expo Modules API, plugin, registration or required runtime peer remains.

## Validation

Static/package gate:

```bash
npm run check
npm pack --dry-run
```

The architecture refactor changes runtime controller/provider wiring, so final Android regression gates are required before merging/releasing this branch even though the previous release-candidate baseline passed Expo57/RN0.86 and bare RN0.87 runtime tests.

Required final runtime matrix:

```text
Expo SDK 57 + RN 0.86.x
  package / prebuild / x86_64 build / navigation Material runtime

bare RN 0.87.0-rc.3
  package / bare adapter / x86_64 build+install / Hermes / NativeScrollHost + MaterialTopAppBar runtime
```

## Package contents

The npm allowlist contains the Android runtime tree plus plugin and JavaScript/TypeScript entry sources. npm also adds `README.md`, `LICENSE` and `package.json`. Example code, scripts, workflow configuration, architecture/release/upstream notes and generated Android build output are excluded.

## License

MIT.
