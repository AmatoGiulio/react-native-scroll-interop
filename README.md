# react-native-scroll-interop

Android-native scroll interoperability for React Native.

`react-native-scroll-interop` exposes the real synchronous Android nested-scroll transaction to native consumers while React Native remains the owner of touch handling, source position and fling physics.

```text
one React Native scroll physics
one synchronous Android nested-scroll transaction
N native consumers
```

Material3 is the reference integration built above the generic core; it is not part of the transport contract.

Current package version:

```text
react-native-scroll-interop@0.1.0-alpha.1
```

## Compatibility

| Target | Status |
|---|---|
| Expo SDK 57 + React Native 0.86.x | Certified before the architecture-only follow-up: package/prebuild/x86_64 build/runtime |
| bare React Native 0.87.0-rc.3 | Certified before the architecture-only follow-up: package/autolinking/x86_64 build/install/Hermes/runtime |
| Expo + React Native 0.87 | Not claimed until an officially supported Expo/RN pairing exists |
| Android | Native nested-scroll core + standard RN native package + Material3 reference consumers |
| iOS / web | Safe component fallbacks; navigation options pass through |

The current peer contracts are:

```text
react-native                       >=0.86.0 <0.87.0 || >=0.87.0-rc.3 <0.88.0
react                              >=19.2.0 <20.0.0
react-native-safe-area-context     >=5.0.0 <6.0.0
react-native-screens               >=4.26.0 <4.27.0    optional
expo-router                        >=57.0.0 <58.0.0     optional
@react-navigation/native-stack     >=7.0.0 <8.0.0       optional
```

Expo and Expo Modules are not required by the native runtime.

## Architecture

The Android implementation is split into explicit layers:

```text
Neutral core
  android/.../com/reactnativescroll/interop/core
        |
React Native boundary
  android/.../com/reactnativescroll/interop/reactnative
        |
Material3 consumers
  android/.../com/reactnativescroll/interop/material3
        |
Material3 native UI/reference integration
  android/.../com/reactnativescroll/interop/material3/ui
```

The **Neutral core** owns lifecycle, conservation and PRE/POST dispatch. The **React Native boundary** recognizes RN vertical sources and forwards real Android callbacks. **Material3 consumers** translate the generic transaction into TopAppBar/FloatingToolbar behavior.

The old Expo Modules implementation tree is removed. `NativeScrollHost`, `MaterialTopAppBar` and `MaterialToolbar` are standard React Native native components registered by `ReactNativeScrollInteropPackage`.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full contract.

## Root API

```tsx
import {
  MaterialToolbar,
  MaterialTopAppBar,
  NativeScrollHost,
} from 'react-native-scroll-interop';
```

### `NativeScrollHost`

```tsx
import { ScrollView } from 'react-native';
import { NativeScrollHost } from 'react-native-scroll-interop';

<NativeScrollHost style={{ flex: 1 }}>
  <ScrollView>{/* content */}</ScrollView>
</NativeScrollHost>
```

On Android it renders `RNSINestedScrollHost`, a standard RN `ViewGroupManager` surface. React Native remains the touch/fling owner.

### `MaterialTopAppBar`

```tsx
<MaterialTopAppBar
  title="Home"
  variant="large"
  scrollBehavior="exitUntilCollapsed"
/>
```

Key props:

```ts
title: string
visible?: boolean
variant?: 'small' | 'medium' | 'large'
scrollBehavior?: 'none' | 'enterAlways' | 'exitUntilCollapsed'
navigationIcon?: 'none' | 'back'
navigationAccessibilityLabel?: string
onNavigationPress?: () => void
placement?: 'overlay' | 'header'
themeMode?: 'system' | 'light' | 'dark'
dynamicColor?: boolean
```

Material TopAppBar is a PRE/POST consumer of the real transaction. It never moves the RN source directly.

### `MaterialToolbar`

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

`scrollBehavior="exitAlways"` observes the child-consumed POST distance. FloatingToolbar remains observation-only and consumes zero list distance.

## Bare React Native

A standard Community React Native host can enable the validated ReactAndroid compatibility path without Expo:

```bash
node ./node_modules/react-native-scroll-interop/plugin/bareReactNativeScrollCompat.js
```

The package itself autolinks through `ReactNativeScrollInteropPackage`.

The adapter is version-scoped to the validated RN 0.86/0.87 source shapes and fails closed if those shapes change.

## react-native-screens adapter

For navigation-first ownership, `reactNativeScreensInterop` currently supports `react-native-screens 4.26.x`. It makes the native `Screen` the real `NestedScrollingParent3` owner and delegates the same transaction to `ReactNativeNestedScrollParentController`.

This is an adapter of the generic core; it contains no Material3 or navigation-option logic.

The upstream-neutral path is documented in [`UPSTREAM_REACT_NATIVE_SCREENS.md`](./UPSTREAM_REACT_NATIVE_SCREENS.md). The proposed upstream seam is AndroidX-only and does not depend on this package, Material3, Expo Router or React Navigation.

## Shared navigation mapping

Navigation semantics live in one **shared Material3/navigation mapper**:

```text
src/navigation/material3NavigationMapper.ts
```

It maps title, large-title, Back and `material3.topAppBar` options. It imports neither Expo Router nor React Navigation and contains no nested-scroll transport logic.

Both navigation adapters render the same `MaterialTopAppBar` from that result.

## Expo Router

```tsx
import { Stack } from 'react-native-scroll-interop/router';
```

Example:

```tsx
<Stack>
  <Stack.Screen
    name="index"
    options={{
      title: 'Home',
      headerLargeTitle: true,
      material3: {
        topAppBar: {
          scrollBehavior: 'exitUntilCollapsed',
        },
      },
    }}
  />
</Stack>
```

`react-native-scroll-interop/router` is a thin adapter over Expo Router's existing `Stack`; it does not create navigation state and it does not transport scroll frames.

## React Navigation

The React Navigation adapter is optional and lives at:

```tsx
import {
  material3NativeStackNavigatorOptions,
  material3NativeStackScreenOptions,
  withMaterial3NativeStackOptions,
} from 'react-native-scroll-interop/react-navigation';
```

Navigator-level example:

```tsx
<Stack.Navigator
  screenOptions={material3NativeStackNavigatorOptions({
    headerLargeTitle: true,
    material3: {
      topAppBar: {
        scrollBehavior: 'exitUntilCollapsed',
      },
    },
  })}
>
  {/* screens */}
</Stack.Navigator>
```

Screen-level example:

```tsx
<Stack.Screen
  name="Details"
  component={DetailsScreen}
  options={material3NativeStackScreenOptions({
    title: 'Details',
    material3: {
      topAppBar: {
        variant: 'medium',
        scrollBehavior: 'enterAlways',
      },
    },
  })}
/>
```

For option factories:

```tsx
screenOptions={withMaterial3NativeStackOptions(({ route }) => ({
  title: route.name,
}))}
```

Public adapter types include `Material3NativeStackNavigationOptions`, `Material3StackNavigationOptions` and `Material3TopAppBarNavigationOptions`.

Unsupported/custom header behavior falls back to the navigation library's native header instead of silently dropping behavior.

## Expo config plugin

Expo remains an optional host integration:

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

`reactNativeScrollCompat` applies the same RN source compatibility machinery used by the bare adapter. `reactNativeScreensInterop` applies the validated 4.26.x screen-owner adapter.

## Transaction ownership

```text
requested dy
  -> PRE consumers
  -> React Native source moves the remainder
  -> POST consumers
  -> POST observers
  -> remaining
```

```text
requested = preConsumed + childConsumed + postConsumed + remaining
```

The package does not use per-frame JS `onScroll`, sampled `scrollY`, reconstructed momentum, parent `scrollBy`/`scrollTo`, or a second source scroller.

## Validation

```bash
npm run check
npm pack --dry-run
```

Because this architecture follow-up moves native Kotlin packages and adds a new public navigation entry point, fresh RN 0.86/0.87 build/runtime gates are required before this branch can be merged even though the transaction algorithms themselves are unchanged.

## License

MIT.
