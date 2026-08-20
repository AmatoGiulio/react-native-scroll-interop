# Release status

Package: `react-native-scroll-interop`

Current version:

```text
0.1.0-alpha.1
```

npm status: **not published yet**.

The previous release candidate passed both Android runtime matrices. This architecture branch changes the RN controller/participant-provider wiring, so those results are retained as a baseline but are **not** treated as certification of the new branch until the final regression gates below pass again.

## Architecture completion status

The six target architecture points are implemented on this branch:

1. **Neutral core** — lifecycle, source identity, conservation and PRE/POST/observer dispatcher remain in `com.reactnativescroll.interop.core` with no RN/Material/Expo dependency.
2. **Standard RN boundary** — `NativeScrollHost`, the RN source boundary and controller are standard React Native code. The controller binds only neutral participant ports and has no Material3 dependency.
3. **react-native-screens adapter** — the 4.26.x patcher now integrates only `ReactNativeScreenNestedScrollBridge`. The bridge contains source discovery/controller ownership but no Material or screens concrete type. The proposed upstream-neutral contract is documented in `UPSTREAM_REACT_NATIVE_SCREENS.md`.
4. **Material3 reference consumer** — Material3 owns its registry, participant provider, TopAppBar consumer and FloatingToolbar observer above the RN/core boundary.
5. **Navigation adapters** — `src/navigation/material3NavigationMapper.ts` owns the common navigation-to-Material mapping. `/react-navigation` and `/router` are thin adapters over it and contain no scroll transport logic.
6. **General package primitive** — the root package exposes generic RN/Android nested-scroll transport with Material3 as the shipped reference integration; Expo is optional rather than a native-runtime requirement.

The historical private Kotlin package name `expo.modules.materialtoolbar` remains only for Compose host implementation classes in this alpha. It does not use Expo Modules Kotlin APIs, the Expo Modules Gradle plugin, module registration or a required Expo peer; it is not the transport or public native boundary.

## Previous runtime baseline

### React Native 0.86.x gate

Previous baseline: **PASS** on Expo SDK 57 before the current controller/provider refactor.

Previously validated scope:

- package artifact installation;
- clean Expo Android prebuild;
- ReactAndroid source build;
- RN 0.86 ordinary non-paging AndroidX fling patch;
- both `MainReactPackage` manager paths;
- `react-native-screens 4.26.x` screen-owned integration;
- x86_64 Android assemble/development runtime;
- navigation-first MaterialTopAppBar and persistent MaterialToolbar runtime;
- TOUCH/NON_TOUCH fling behavior;
- push/pop/back source ownership and source-scoped toolbar restoration.

**Required before merge/release of this branch:** rerun the package/prebuild/x86_64 build + navigation Material runtime gate because the screen patch now delegates through `ReactNativeScreenNestedScrollBridge` and the RN controller binds Material3 through a neutral provider.

### React Native 0.87.x gate

Previous baseline: **PASS** on bare `react-native@0.87.0-rc.3` before the current controller/provider refactor.

Previously validated scope:

- no-Expo package installation with normal peer resolution;
- standard RN autolinking;
- bare compatibility adapter;
- ReactAndroid source build and prebuilt Hermes;
- `:react-native-scroll-interop:compileDebugKotlin`;
- x86_64 assemble/install;
- Hermes launch;
- public `NativeScrollHost` + `MaterialTopAppBar` runtime;
- touch, inertial fling, reverse fling and TopAppBar collapse/expand.

**Required before merge/release of this branch:** rerun compile/assemble/install/runtime because `NativeScrollHost` moved fully into the RN boundary and participant binding now goes through `ReactNativeNestedScrollParticipantProvider`.

## Static/package gates

Run from the final branch commit:

```bash
npm run check
npm pack --dry-run
npm publish --dry-run --access public --tag next
```

`npm run check` now includes:

- architecture boundary invariant;
- scroll ownership/conservation invariant;
- Material3 participant-provider invariant;
- shared navigation mapper + thin React Navigation/Expo Router adapter invariant;
- RN 0.86/0.87 compatibility patch invariant;
- bare RN compatibility adapter invariant;
- neutral `react-native-screens 4.26.x` bridge patch invariant;
- package-surface invariant.

## Final merge/release gate

Do not merge this architecture branch or publish npm until all of the following are true:

```text
static/package/publish dry-run                                      PASS
Expo SDK 57 + RN 0.86 x86_64 build + navigation Material runtime   PASS
bare RN 0.87.0-rc.3 compile/build/install/Hermes runtime           PASS
NativeScrollHost touch/fling/reverse-fling                          PASS
MaterialTopAppBar collapse/expand                                  PASS
```

The first npm publication remains a separate manual action after the final merged/documentation-frozen package checks.
