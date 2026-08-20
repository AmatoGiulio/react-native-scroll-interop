# react-native-scroll-interop

Android-native scroll interoperability for React Native.

`react-native-scroll-interop` exposes the real synchronous Android nested-scroll transaction to native consumers while React Native remains the owner of touch handling, source position and fling physics.

```text
one React Native scroll physics
one synchronous Android nested-scroll transaction
N native consumers
```

Material3 is the shipped reference integration above the generic core; it is not part of the transport contract.

Current package version:

```text
react-native-scroll-interop@0.1.0-alpha.1
```

## Compatibility

| Target | Status |
|---|---|
| Expo SDK 57 + React Native 0.86.x | Certified baseline before PR #26; fresh final-head regression required |
| bare React Native 0.87.0-rc.3 | Certified baseline before PR #26; fresh final-head regression required |
| Expo + React Native 0.87 | Not claimed until an officially supported Expo/RN pairing exists |
| Android | Neutral nested-scroll core + generic RN boundary + Material3 reference consumers |
| iOS / web | Safe component fallbacks; navigation options pass through |

Peer contracts:

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

```text
Neutral core
  android/.../com/reactnativescroll/interop/core
        |
Generic React Native boundary
  android/.../com/reactnativescroll/interop/reactnative
        |
Neutral participant-provider contract
        |
Material3 reference provider/consumers
  android/.../com/reactnativescroll/interop/material3[/ui]
```

The **Neutral core** owns source lifecycle, conservation and PRE/POST/observer dispatch. The **React Native boundary** recognizes RN vertical sources and translates real Android parent callbacks. It has no Material3 dependency: native consumers are supplied through `ReactNativeNestedScrollParticipantProvider` and `ReactNativeNestedScrollParticipantSession`.

`ReactNativeNestedScrollParentController` remains the stable facade; `ReactNativeNestedScrollControllerCore` owns the RN transaction lifecycle behind it. `ReactNativeScrollInteropPackage` is the composition root that installs Material3 as the shipped reference provider.

The historical `android/src/main/java/expo/...` implementation tree is removed. `NativeScrollHost`, `MaterialTopAppBar` and `MaterialToolbar` are standard React Native native components.

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

On Android it renders `RNSINestedScrollHost`, a standard RN `ViewGroupManager`. It discovers the supported RN vertical source and delegates to the generic RN controller; React Native remains the touch/fling owner.

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

`scrollBehavior="exitAlways"` observes child-consumed POST distance. FloatingToolbar is observation-only and consumes zero list distance.

## Bare React Native

A standard Community React Native host can enable the validated ReactAndroid compatibility path without Expo:

```bash
node ./node_modules/react-native-scroll-interop/plugin/bareReactNativeScrollCompat.js
```

The native package autolinks through `ReactNativeScrollInteropPackage`. The adapter is version-scoped to the validated RN 0.86/0.87 source shapes and fails closed if those shapes change.

## react-native-screens adapter

For navigation-first ownership, `reactNativeScreensInterop` currently supports `react-native-screens 4.26.x`.

The patched native `Screen` remains the real `NestedScrollingParent3` ancestor but imports only `ReactNativeScreenNestedScrollBridge`. That bridge owns source discovery/binding and forwards AndroidX callbacks to the generic RN controller. The source patch contains no Material3, Expo Router or React Navigation logic.

The upstream-neutral path is documented in [`UPSTREAM_REACT_NATIVE_SCREENS.md`](./UPSTREAM_REACT_NATIVE_SCREENS.md). The eventual upstream seam is AndroidX-only and does not depend on this package.

## Shared navigation mapping

Navigation semantics live in one **shared Material3/navigation mapper** plus one shared renderer:

```text
src/navigation/material3NavigationMapper.ts
src/navigation/Material3NavigationHeader.tsx
```

The mapper decides title, large-title, Back, `material3.topAppBar` and native-header fallback. It imports neither Expo Router nor React Navigation and contains no nested-scroll transport logic.

`Material3NavigationHeader` turns the normalized descriptor into `MaterialTopAppBar` props. Expo Router and React Navigation are thin adapters over those two shared pieces.

## Expo Router

```tsx
import { Stack } from 'react-native-scroll-interop/router';
```

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

`react-native-scroll-interop/router` wraps Expo Router's existing `Stack`; it does not create navigation state and does not transport scroll frames.

## React Navigation

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

Option factories:

```tsx
screenOptions={withMaterial3NativeStackOptions(({ route }) => ({
  title: route.name,
}))}
```

Public adapter types include `Material3NativeStackNavigationOptions`, `Material3ReactNavigationOptions`, `Material3ReactNavigationHeaderProps`, `Material3StackNavigationOptions` and `Material3TopAppBarNavigationOptions`.

The adapter uses a structural native-stack option shape and therefore has no runtime/type import from React Navigation. The optional native-stack v7 peer documents the currently targeted compatibility line. Unsupported/custom header behavior falls back to the navigation library's native header.

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

PR #26 changes packaged native transaction wiring, so the previous Expo57/RN0.86 and bare RN0.87 runtime results are baseline evidence only. Fresh final-head build/runtime gates are required before the PR can leave draft state.

## License

MIT.
