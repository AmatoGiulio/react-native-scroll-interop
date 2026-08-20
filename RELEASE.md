# Release status

Package: `react-native-scroll-interop`

Version: `0.1.0-alpha.1`

npm status: **not published yet**.

## Architecture follow-up

PR #26 finishes the separation planned for this alpha:

- neutral nested-scroll core remains under `com.reactnativescroll.interop.core`;
- React Native source recognition, parent facade/engine, `NativeScrollHost` and screen bridge live under `com.reactnativescroll.interop.reactnative`;
- native consumers enter the RN transaction only through `ReactNativeNestedScrollParticipantProvider` / `ReactNativeNestedScrollParticipantSession`;
- the historical `android/src/main/java/expo/...` implementation tree is removed;
- Material3 behavior lives under `com.reactnativescroll.interop.material3`;
- Material3 native UI/managers/registry/provider live under `com.reactnativescroll.interop.material3.ui`;
- `ReactNativeScrollInteropPackage` composes Material3 as the shipped reference provider without leaking it into the RN controller;
- Expo Router and React Navigation share an internal navigator-neutral mapper plus `Material3NavigationHeader` renderer; only `/router` and `/react-navigation` are public adapter entry points;
- `react-native-screens 4.26.x` patches only to `ReactNativeScreenNestedScrollBridge` while `UPSTREAM_REACT_NATIVE_SCREENS.md` defines the neutral upstream seam;
- an explicit architecture-boundary checker is part of `npm run check`.

Because this follow-up changes packaged native transaction wiring and public navigation surfaces, the device/build certification from the pre-#26 commit is historical evidence only. It must be repeated on the final PR #26 head before merge/publication.

## Previous certified baseline

### React Native 0.86.x gate

Previously **PASS** on Expo SDK 57:

- exact package installation;
- clean Android prebuild;
- ReactAndroid source compatibility patch;
- `react-native-screens 4.26.x` screen ownership;
- x86_64 Android assemble/runtime;
- MaterialTopAppBar and MaterialToolbar runtime;
- TOUCH/NON_TOUCH fling and navigation source restoration.

### React Native 0.87.x gate

Previously **PASS** on bare `react-native@0.87.0-rc.3`:

- no-Expo package installation and standard RN autolinking;
- bare compatibility adapter;
- ReactAndroid source build with prebuilt Hermes;
- `:react-native-scroll-interop:compileDebugKotlin`;
- x86_64 assemble/install/Hermes launch;
- public `NativeScrollHost` + `MaterialTopAppBar` runtime;
- touch, inertial fling, reverse fling and large TopAppBar collapse/expand.

## Required final gates for PR #26

Before PR #26 can leave draft state:

```text
npm run check                                      PASS required
npm pack --dry-run                                 PASS required
Expo SDK 57 / RN 0.86.x fresh package+build      PASS required
bare RN 0.87.0-rc.3 fresh package+build/runtime  PASS required
```

The navigation adapters are mapping-only surfaces and must contain no nested-scroll transport logic.

## Public-package checks before npm

After PR #26 is merged and documentation is frozen:

```bash
npm run check
npm pack --dry-run
npm publish --dry-run --access public --tag next
```

Then verify the tarball contains the neutral core/RN/Material3 layers plus optional navigation adapters, and contains no legacy Expo implementation tree or repository-only artifacts.
