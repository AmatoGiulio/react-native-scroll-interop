# Release status

Package: `react-native-scroll-interop`

Current version:

```text
0.1.0-alpha.1
```

GitHub source status: ready for public review.

npm status: **not published yet**. Publication is intentionally deferred until the final public-package checks are completed from the documentation-frozen commit.

## Current compatibility matrix

```text
Expo SDK 57 + React Native 0.86.x
  exact package / clean prebuild / Android build+install / Material navigation runtime   PASS

bare React Native 0.87.0-rc.3
  package / shipped RN patch / RN source build / Android build+install / RN runtime      PASS

Expo + React Native 0.87
  not claimed until an officially supported Expo/RN pairing exists
```

The package manifest declares React Native `>=0.86.0 <0.88.0`, Expo Router `>=57.0.0 <58.0.0`, `react-native-screens >=4.26.0 <4.27.0` and `react-native-safe-area-context >=5.0.0 <6.0.0`.

## Release artifact boundary

Runtime and compatibility code for `0.1.0-alpha.1` passed the device/build gates before this documentation-only freeze. Because npm includes `README.md` automatically, the final npm tarball generated from the public documentation commit will have different bytes from the previously tested candidate even though runtime/plugin/package source is unchanged.

Before npm publication, generate a fresh tarball from the final commit and rerun the static/package checks. Device runtime gates only need to be repeated if runtime code, plugin code, dependency metadata or another packaged source changes.

### React Native 0.86.x gate

Status: **PASS** on Expo SDK 57.

Certified scope:

- package installation from the release candidate;
- clean Expo Android prebuild;
- ReactAndroid source build;
- RN 0.86 ordinary non-paging fling patch to AndroidX `super.fling(correctedVelocityY)`;
- both `MainReactPackage` vertical manager paths using `ReactNestedScrollViewManager`;
- `react-native-screens 4.26.x` screen-owned nested-scroll integration;
- Android assemble/install;
- navigation-first `MaterialTopAppBar` runtime;
- persistent `MaterialToolbar` / FloatingToolbar runtime;
- touch and NON_TOUCH fling behavior;
- push/pop/back source ownership and per-source toolbar state restoration.

Navigation-first screens remain plain React Native vertical scroll content. `NativeScrollHost` is the standalone/fallback API and is not required when the native screen owns the parent integration.

### React Native 0.87.x gate

Status: **PASS for bare RN compatibility** on `react-native@0.87.0-rc.3`.

Certified scope:

- the shipped compatibility patcher selects the RN 0.87 Kotlin source shape;
- both `MainReactPackage.kt` vertical manager sites are patched;
- ordinary non-paging `ReactNestedScrollView.kt` fling delegates to AndroidX `super.fling(correctedVelocityY)`;
- RN 0.86-specific fling markers are absent;
- React Native is compiled from the installed source tree;
- Android assemble/install succeeds;
- the app launches with Hermes on RN `0.87.0-rc.3`;
- React Native ScrollView touch, inertial fling and reverse fling run without visible regression.

This gate certifies React Native compatibility, source patching and the real RN scroll/fling runtime. It does **not** claim Expo-native `NativeScrollHost`, `MaterialTopAppBar` or `MaterialToolbar` runtime certification on RN 0.87 RC.

## Expo Modules boundary

The Material native views are Expo Modules. There is currently no officially supported Expo SDK pairing for `react-native@0.87.0-rc.3` through the standard Expo Modules installation path.

This release therefore does not force Expo 58/canary or carry host-only Gradle/Kotlin/Prefab shims to manufacture an unsupported pairing. Material/Expo runtime certification remains Expo SDK 57 + RN 0.86.x until Expo officially supports an RN 0.87 line.

## Public-package checks before npm

Run from the final documentation-frozen commit:

```bash
npm run check
npm pack --dry-run
npm publish --dry-run --access public --tag next
```

Verify before the real publish:

- package name, version, license, repository and public entry points;
- peer dependency ranges;
- tarball file list contains only intended runtime/plugin/JS sources plus npm-mandatory metadata;
- `README.md` matches the current compatibility claims above;
- no generated Android output, local consumer files, credentials, keystores or probe artifacts are packaged;
- the config plugin still fails closed outside the certified source shapes.

The first npm publication will be performed manually only after these checks are clean.
