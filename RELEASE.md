# Release process

Public package: `react-native-scroll-interop`

Current release line: `0.1.0-alpha.x`

Alpha releases use npm dist-tag `next`.

## First-public-alpha blocker

Do not publish `0.1.0-alpha.1` until one exact tarball passes both supported React Native lines:

```text
React Native 0.86.x
React Native 0.87.x
```

The supported Android navigation shape is:

```text
navigation layout
├── Stack / navigator
│   └── MaterialTopAppBar per route
└── persistent MaterialToolbar

native screen
└── plain React Native vertical source
```

`NativeScrollHost` remains the standalone/fallback API; it is not required inside normal screens when `reactNativeScreensInterop` owns the native screen parent.

## Static/package gate

From the release commit:

```bash
npm run check
npm pack --dry-run
```

`npm run check` must cover scroll invariants, Material3 adapter boundaries, navigation integration, the RN 0.86/0.87 compatibility patcher, the `react-native-screens 4.26.x` patcher and tarball contents.

The tarball must contain runtime/plugin source only, plus npm-mandatory `README.md`, `LICENSE` and `package.json`.

## Shared Android plugin configuration

For a navigation-first consumer:

```json
[
  "react-native-scroll-interop",
  {
    "android": {
      "reactNativeScrollCompat": true,
      "reactNativeScreensInterop": true
    }
  }
]
```

For standalone `NativeScrollHost`, `reactNativeScreensInterop` may be omitted.

Both source-patching options are fail-closed and version-scoped.

### React Native 0.86.x gate

Use the exact release tarball in the repository's supported Expo SDK 57 / RN 0.86.x host or an equivalent fresh consumer.

Required build checks:

- plugin resolves through the public package name;
- ReactAndroid is built from source;
- `ReactNestedScrollView.java` ordinary non-paging fling is patched to `super.fling(correctedVelocityY)`;
- both `MainReactPackage` ScrollView manager paths select `ReactNestedScrollViewManager`;
- `react-native-screens 4.26.x` patch applies when navigation ownership is enabled;
- Android compile/install succeeds.

Required runtime checks:

- TOUCH scroll works normally;
- ordinary fling produces the real NON_TOUCH nested-scroll lifecycle;
- TopAppBar scroll behavior is correct;
- FloatingToolbar behavior is correct;
- Home -> Details -> Back works;
- repeated push/pop/back has no vertical jump or stale binding;
- a new transaction works after returning to a previous screen.

The current repository navigation-first example is the RN 0.86 smoke app.

### React Native 0.87.x gate

Use the exact same release tarball in a fresh native host that is compatible with RN 0.87.x.

Required build checks:

- `reactNativeScrollCompat` accepts the installed 0.87.x version;
- ReactAndroid is built from source;
- `ReactNestedScrollView.kt` ordinary non-paging fling is patched to `super.fling(correctedVelocityY)`;
- both `MainReactPackage` ScrollView manager paths select `ReactNestedScrollViewManager`;
- the package native module compiles and installs without an RN 0.86-only shim/path assumption.

Required runtime checks:

- TOUCH and NON_TOUCH sessions are balanced;
- ordinary fling is driven by the RN source and AndroidX nested-scroll lifecycle;
- no parent-owned motion or source mutation is introduced;
- `NativeScrollHost` standalone transport works;
- when a compatible `react-native-screens 4.26.x` navigation host is used, the screen-owned path also works without page-level `NativeScrollHost`.

Do not interpret RN 0.87 support as permission to force RN 0.87 into an Expo SDK that targets another RN line. The release gate must use a host stack that supports the selected RN version.

### Expo Router navigation-first gate

For the current Expo SDK 57 / RN 0.86 example:

- import `Stack` from `react-native-scroll-interop/router`;
- use standard `Stack` / `Stack.Screen` declarations;
- use `title` and `headerLargeTitle` for standard semantics;
- use `material3.topAppBar` only for Material-only options;
- keep one persistent `MaterialToolbar.Root` in the navigation layout;
- keep screen files as plain RN scroll content;
- do not add manual TopAppBar sizing/safe-area/back wiring.

Runtime:

```text
Home scroll/fling
Home -> Details
Details scroll/fling
Back
repeat push/pop
new Home scroll
```

No initial jump, transition jump, duplicate chrome binding or stale transaction is allowed.

### React Navigation native-stack gate

Before publication, install the exact tarball in a React Navigation native-stack consumer using the certified `react-native-screens` line.

For this alpha, custom `MaterialTopAppBar` may be supplied through the normal native-stack `header` option. Screen content stays plain RN scroll content and one `MaterialToolbar.Root` may live outside the navigator when persistent chrome is desired.

Run the same scroll/fling/push/pop/back checks as the Expo Router gate.

## Freeze

After all required gates pass, create an immutable checkpoint/tag for the exact tested commit. Do not repoint a passing release checkpoint after code changes.

## First npm publish

Before the first publish:

```bash
npm view react-native-scroll-interop
npm login
npm whoami
npm publish --dry-run --access public --tag next
```

If the package name is unexpectedly occupied or authentication is not the intended maintainer account, stop.

Publish:

```bash
npm publish --access public --tag next
```

`prepublishOnly` runs `npm run check`.

First public version:

```text
react-native-scroll-interop@0.1.0-alpha.1
```

## Trusted publishing after bootstrap

After the package exists on npm, `.github/workflows/publish-npm.yml` is the release workflow for later tagged alpha releases using GitHub OIDC/npm trusted publishing.

For each subsequent alpha:

1. bump package and Android version metadata together;
2. run both RN release gates on the exact candidate;
3. freeze the commit;
4. tag `v0.1.0-alpha.N`;
5. publish the GitHub Release;
6. allow the trusted-publishing workflow to publish with dist-tag `next`.

Do not publish a stable `latest` until the stable compatibility matrix and release gate are defined separately.
