# Release status

Package: `react-native-scroll-interop`

Current version:

```text
0.1.0-alpha.1
```

GitHub source status: ready for public review after the final documentation-frozen package checks.

npm status: **not published yet**. Publication is intentionally deferred until the final public-package checks are completed from the documentation-frozen commit.

## Current compatibility matrix

```text
Expo SDK 57 + React Native 0.86.x
  exact package / clean prebuild / ReactAndroid source build / x86_64 Android build / Material navigation runtime   PASS

bare React Native 0.87.0-rc.3
  exact package / no-Expo install / bare adapter / ReactAndroid source build / x86_64 build+install / Hermes / NativeScrollHost + MaterialTopAppBar runtime   PASS

Expo + React Native 0.87
  not claimed until an officially supported Expo/RN pairing exists
```

The package manifest declares React Native `>=0.86.0 <0.87.0 || >=0.87.0-rc.3 <0.88.0`, Expo Router `>=57.0.0 <58.0.0`, `react-native-screens >=4.26.0 <4.27.0` and `react-native-safe-area-context >=5.0.0 <6.0.0`. Expo is not a required native-runtime peer.

## Release artifact boundary

Runtime, compatibility code and dependency metadata for `0.1.0-alpha.1` passed the device/build gates before this documentation-only freeze. Because npm includes `README.md` automatically, the final npm tarball generated from the documentation-frozen commit will have different bytes from the previously tested candidate even though runtime/plugin/package source is unchanged. `RELEASE.md` itself is repository-only and is not part of the npm package.

Before npm publication, generate a fresh tarball from the final documentation commit and rerun the complete static/package checks plus publish dry-run. Device runtime gates only need to be repeated if runtime code, plugin code, dependency metadata or another packaged source changes.

### React Native 0.86.x gate

Status: **PASS** on Expo SDK 57.

Certified scope:

- installation from the exact package artifact;
- clean Expo Android prebuild;
- ReactAndroid source build;
- RN 0.86 ordinary non-paging fling patch to AndroidX `super.fling(correctedVelocityY)`;
- both `MainReactPackage` vertical manager paths using `ReactNestedScrollViewManager`;
- `react-native-screens 4.26.x` screen-owned nested-scroll integration;
- x86_64 Android assemble/development runtime;
- navigation-first `MaterialTopAppBar` runtime;
- persistent `MaterialToolbar` / FloatingToolbar runtime;
- touch and NON_TOUCH fling behavior;
- push/pop/back source ownership and per-source toolbar state restoration.

Navigation-first screens remain plain React Native vertical scroll content. `NativeScrollHost` is the standalone/fallback API and is not required when the native screen owns the parent integration.

### React Native 0.87.x gate

Status: **PASS** on bare `react-native@0.87.0-rc.3`.

Certified scope:

- fresh Community React Native consumer with no Expo or Expo Router installed;
- installation from the exact package tarball with normal npm peer resolution, without `--force` or `--legacy-peer-deps`;
- standard React Native autolinking registers `ReactNativeScrollInteropPackage`;
- shipped `plugin/bareReactNativeScrollCompat.js` applies successfully without Expo tooling;
- standard Community `settings.gradle` shape is validated before source-build wiring;
- ReactAndroid-only composite source substitution is installed idempotently;
- Hermes remains on React Native's prebuilt Android artifact path;
- RN 0.87 unified `HERMES_VERSION_NAME` metadata is used for the prebuilt Hermes coordinate;
- Windows Gradle source-build placeholder is created only for the validated RN shape;
- both `MainReactPackage.kt` vertical manager sites are patched;
- ordinary non-paging `ReactNestedScrollView.kt` fling delegates to AndroidX `super.fling(correctedVelocityY)`;
- React Native is compiled from the installed source tree;
- `:react-native-scroll-interop:compileDebugKotlin` succeeds;
- x86_64 `:app:assembleDebug` and `:app:installDebug` succeed;
- the app launches with Hermes;
- `RNSINestedScrollHost` mounts through the public `NativeScrollHost` API;
- `RNSIMaterialTopAppBar` mounts through the public `MaterialTopAppBar` API;
- touch scrolling, inertial fling and reverse fling run without visible regression;
- large `MaterialTopAppBar` `exitUntilCollapsed` collapse/expand behavior follows the real nested-scroll transaction without visible jump, double consumption or crash.

This gate certifies the standard React Native native-package boundary, the bare compatibility adapter, source patching, prebuilt-Hermes integration and the actual Material/native scroll runtime on RN `0.87.0-rc.3`.

## Expo boundary

The Android native runtime no longer depends on Expo Modules registration or the Expo Modules Gradle plugin. `NativeScrollHost`, `MaterialTopAppBar` and `MaterialToolbar` are registered as standard React Native view managers through `ReactNativeScrollInteropPackage`, and the JavaScript bindings use `requireNativeComponent`.

Expo remains an optional host integration:

- `app.plugin.js` / `withScrollInterop` can apply the validated React Native source patch and optional `react-native-screens` ownership integration during Expo prebuild;
- `/router` is an optional Expo Router adapter;
- neither Expo nor Expo Modules is required by the native runtime itself.

There is currently no claimed Expo + RN 0.87 certification because there is no officially supported Expo/RN pairing used for this release gate. The absence of that claim does not limit the independently certified bare RN 0.87 native runtime above.

## Public-package checks before npm

Run from the final documentation-frozen commit:

```bash
npm run check
npm pack --dry-run
npm publish --dry-run --access public --tag next
```

Verify before the real publish:

- package name, version, license, repository and public entry points;
- peer dependency ranges, including the explicit RN 0.87 prerelease floor;
- tarball file list contains only intended runtime/plugin/JS sources plus npm-mandatory metadata;
- `README.md` matches the certified compatibility claims above;
- no generated Android output, local consumer files, credentials, keystores or probe artifacts are packaged;
- both Expo and bare compatibility adapters fail closed outside the certified source shapes;
- the final package surface remains within the checked file-count and unpacked-size bounds.

The first npm publication will be performed manually only after these checks are clean.
