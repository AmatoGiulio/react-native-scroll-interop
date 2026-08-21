# react-native-scroll-interop

Native Android nested-scroll interoperability for React Native.

[![Check](https://github.com/AmatoGiulio/react-native-scroll-interop/actions/workflows/check.yml/badge.svg)](https://github.com/AmatoGiulio/react-native-scroll-interop/actions/workflows/check.yml)

`react-native-scroll-interop` exposes the real synchronous Android nested-scroll transaction to native consumers while React Native remains the owner of touch handling, source position, and fling physics.

It is not a JavaScript scroll observer and it does not reconstruct native motion from sampled positions. The goal is to preserve the native scroll pipeline that already produces the correct physics and let native UI participate in that same transaction.

```text
one React Native scroll physics
one synchronous Android nested-scroll transaction
N native consumers
```

Material3 is the shipped reference integration above the generic core. It is not part of the transport contract.

## Status

Current release line:

```text
react-native-scroll-interop@0.1.0-alpha.1
npm dist-tag: next
```

This is a public alpha with a deliberately narrow compatibility matrix. The runtime architecture, package surface, supported build paths, and native behavior have been validated on the exact source tree documented in [`RELEASE.md`](./RELEASE.md).

## Why this exists

React Native already owns the user gesture and the scroll source. Native UI such as a Material3 TopAppBar also has its own native nested-scroll behavior. A high-fidelity integration should connect those two systems without creating a second scroll engine.

This package therefore avoids:

- per-frame JavaScript `onScroll` transport;
- sampled `scrollY` momentum reconstruction;
- parent-owned `Scroller` / `OverScroller` physics;
- parent `scrollBy` / `scrollTo` calls that move the React Native source;
- duplicate velocity integration;
- fake nested-scroll sessions created outside the real Android transaction.

For the Material3 reference implementation, the terminal settle is delegated back to the native Material state rather than approximated in JavaScript.

## Installation

```bash
npm install react-native-scroll-interop@next
```

The package autolinks as a standard React Native Android package. Expo Modules are not required by the native runtime.

## Compatibility

| Target | Current status |
|---|---|
| Expo SDK 57 + React Native 0.86.x | **Certified** on the final PR #26 source tree: exact package install, clean prebuild, Android compile/assemble, install/runtime, navigation ownership, touch/fling/reverse-fling behavior |
| bare React Native 0.87.0-rc.3 | **Certified** on the same final source tree: exact package install, standard autolinking, compatibility adapter, Android compile/assemble/install, Hermes runtime, touch/fling/reverse-fling behavior |
| React Native 0.87.x | Accepted by the current peer range; the exact stable 0.87 release is tracked as a fresh compatibility gate in the roadmap |
| react-native-screens 4.26.x | Optional navigation-first adapter is validated; the long-term path is an upstream-neutral AndroidX delegate seam |
| Android | Neutral nested-scroll core + generic React Native boundary + Material3 reference consumers |
| iOS / web | Safe component fallbacks and navigation-option pass-through; no Android nested-scroll semantics are emulated |

Peer contracts:

```text
react-native                       >=0.86.0 <0.87.0 || >=0.87.0-rc.3 <0.88.0
react                              >=19.2.0 <20.0.0
react-native-safe-area-context     >=5.0.0 <6.0.0
react-native-screens               >=4.26.0 <4.27.0    optional
expo-router                        >=57.0.0 <58.0.0     optional
@react-navigation/native-stack     >=7.0.0 <8.0.0       optional
```

## Root API

```tsx
import {
  MaterialToolbar,
  MaterialTopAppBar,
  NativeScrollHost,
} from 'react-native-scroll-interop';
```

### `NativeScrollHost`

Use `NativeScrollHost` when the scroll source is not already owned by a supported native screen/container integration.

```tsx
import { ScrollView } from 'react-native';
import { NativeScrollHost } from 'react-native-scroll-interop';

<NativeScrollHost style={{ flex: 1 }}>
  <ScrollView>{/* content */}</ScrollView>
</NativeScrollHost>
```

On Android it renders `RNSINestedScrollHost`, a standard RN `ViewGroupManager`. It discovers a supported React Native vertical source and delegates parent callbacks to the generic RN controller. React Native remains the touch/fling owner.

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

The TopAppBar is a native Material3 PRE/POST consumer of the real nested-scroll transaction. It never moves the React Native source directly.

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

`scrollBehavior="exitAlways"` observes child-consumed POST distance. FloatingToolbar is observation-only with respect to list distance and consumes zero source motion.

## Transaction ownership

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

The neutral core owns transaction lifecycle and conservation. Consumer-specific behavior lives above that core.

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

The **neutral core** owns source lifecycle, signed conservation, and PRE/POST/observer dispatch.

The **React Native boundary** recognizes supported RN vertical sources and translates real Android parent callbacks. It has no Material3 dependency. Native consumers enter through `ReactNativeNestedScrollParticipantProvider` / `ReactNativeNestedScrollParticipantSession`.

`ReactNativeNestedScrollParentController` is the stable RN-facing facade. `ReactNativeNestedScrollControllerCore` owns the transaction engine behind it. `ReactNativeScrollInteropPackage` is the composition root that installs Material3 as the shipped reference provider.

The historical `android/src/main/java/expo/...` implementation tree is gone. `NativeScrollHost`, `MaterialTopAppBar`, and `MaterialToolbar` are standard React Native native components.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full contract.

## Bare React Native

A standard Community React Native host can enable the validated ReactAndroid compatibility path without Expo:

```bash
node ./node_modules/react-native-scroll-interop/plugin/bareReactNativeScrollCompat.js
```

The adapter is version-scoped to the validated RN 0.86/0.87 source shapes and fails closed if an unsupported source shape is detected.

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

`reactNativeScrollCompat` applies the same version-scoped React Native source compatibility machinery used by the bare adapter.

`reactNativeScreensInterop` enables the currently validated `react-native-screens 4.26.x` navigation-first ownership path.

## react-native-screens integration

For navigation-first ownership, the current package adapter keeps the native `Screen` as the real `NestedScrollingParent3` ancestor and delegates into `ReactNativeScreenNestedScrollBridge`.

The bridge owns source discovery/binding and forwards AndroidX callbacks to the same generic RN controller. The patched screen contains no Material3, Expo Router, or React Navigation behavior.

The long-term upstream-neutral contract is documented in [`UPSTREAM_REACT_NATIVE_SCREENS.md`](./UPSTREAM_REACT_NATIVE_SCREENS.md). The proposed seam is AndroidX-only and does not depend on this package.

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

The adapter wraps Expo Router's existing `Stack`. It does not create navigation state and does not transport scroll frames.

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

Option factories are also supported:

```tsx
screenOptions={withMaterial3NativeStackOptions(({ route }) => ({
  title: route.name,
}))}
```

The Expo Router and React Navigation adapters share one internal navigator-neutral mapper and one Material3 header renderer. They contain no nested-scroll transport logic.

## Validation

Repository gates:

```bash
npm run check
npm pack --dry-run
```

The check suite guards:

- architecture boundaries;
- nested-scroll ownership and conservation invariants;
- Material3 adapter boundaries;
- Expo Router / React Navigation mapping invariants;
- RN 0.86 / 0.87 compatibility transformations;
- the current `react-native-screens 4.26.x` adapter;
- npm package surface and tarball size.

Runtime changes are additionally gated through fresh consumer builds and device/emulator validation. The exact evidence for the current alpha is recorded in [`RELEASE.md`](./RELEASE.md).

## Stability policy

`0.1.x-alpha` is intentionally pre-1.0. The architecture and tested behavior are treated seriously, but native integration points may still change while upstream seams and React Native compatibility lines settle.

The `next` dist-tag is used for alpha releases. A stable `latest` tag should not be used until the supported compatibility matrix and upstream ownership path are sufficiently stable.

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md).

The roadmap prioritizes upstream-neutral ownership, current React Native compatibility, reproducible regression evidence, and additional native consumers without weakening the transaction invariants above.

## Reporting issues

For native-scroll issues, include at minimum:

- React Native version;
- Expo SDK version if applicable;
- `react-native-screens` version if applicable;
- Android API level and ABI/device;
- whether the issue occurs on touch, fling, reverse fling, or terminal settle;
- a minimal reproduction or deterministic sequence when possible.

## License

MIT.
