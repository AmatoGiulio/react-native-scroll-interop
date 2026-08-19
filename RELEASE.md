# Release process

Public package: `react-native-scroll-interop`

Current release line: `0.1.0-alpha.x`

Alpha releases use the npm dist-tag `next`. Do not publish an alpha as `latest`.

## First-public-alpha blocker

Do **not** publish `0.1.0-alpha.1` until the navigation-first product shape is validated on the exact release tarball.

Required public shape:

```text
navigation layout
├── Stack / navigator
│   └── MaterialTopAppBar per route
└── one persistent MaterialToolbar

native screen
└── plain React Native vertical scroll source
```

On the certified Android navigation path, `react-native-screens` owns the real nested-scroll parent/controller relationship. Screen components must not need `NativeScrollHost`, repeated TopAppBar declarations or repeated FloatingToolbar declarations.

`NativeScrollHost` remains a standalone/fallback API and is not the normal navigation-first page wrapper.

## Release candidate gate

Before publishing a version, freeze and validate one exact commit:

1. `npm run check`;
2. `npm pack --dry-run` and inspect the package surface;
3. install the exact tarball in an external RN 0.86.x consumer under the public package name;
4. verify the Expo config plugin resolves as `react-native-scroll-interop`;
5. verify both version-scoped Android patches apply cleanly where required;
6. run the Expo Router SDK 57 navigation-first gate;
7. run the React Navigation native-stack navigation-first gate;
8. create a new immutable `*-pass` checkpoint for the exact tested commit.

Do not repoint a frozen release checkpoint.

### Expo Router navigation-first gate

Use the exact release tarball in an Expo SDK 57 / RN 0.86.x consumer.

Required configuration:

```json
[
  "react-native-scroll-interop",
  {
    "android": {
      "rn086AndroidXScroll": true,
      "reactNativeScreensInterop": true
    }
  }
]
```

Required structure:

- import `Stack` from `react-native-scroll-interop/router`;
- use ordinary `Stack` / `Stack.Screen` declarations;
- use standard options such as `title` and `headerLargeTitle` where possible;
- use `material3.topAppBar` only for Material-only behavior;
- one persistent `MaterialToolbar.Root` in the navigation layout;
- screen files contain plain React Native scroll sources and no `NativeScrollHost`;
- no app-owned TopAppBar sizing/safe-area constants or manual Material back wiring.

Runtime validation:

- Android prebuild/build/install from the exact tarball;
- first frame shows the correct TopAppBar geometry;
- Home ordinary scroll + fling;
- navigate Home -> Details;
- Details ordinary scroll + fling;
- automatic Material back returns to Home;
- repeated push/pop/back;
- new Home scroll after return;
- persistent FloatingToolbar/FAB still responds to the active source;
- no vertical transition jump;
- no duplicate/ambiguous chrome binding or stale transaction behavior.

Also verify the local-package resolver does not load a second React/Expo Router graph. This is a repository-example concern; published packages must resolve peers from the consumer app normally.

### React Navigation navigation-first gate

Use the exact same release tarball with React Navigation native stack and the certified `react-native-screens` line.

Required structure:

- `MaterialTopAppBar` supplied through the native stack custom `header` option for this first alpha;
- `headerTransparent: true` for the custom Material header path;
- one persistent `MaterialToolbar.Root` around the navigator;
- host navigator supplies real navigation/back ownership through `navigation.goBack()`;
- screen content is a plain React Native vertical scroll source with no `NativeScrollHost` on the screen-owned path;
- no duplicate chrome inside screen components.

Runtime validation matches the Expo Router gate: scroll/fling on both screens, forward navigation, native Material back, return/new scroll, repeated transitions, persistent toolbar and no ambiguous/stale binding.

The React Navigation gate remains required even though both stacks use `react-native-screens`; API/navigation lifecycle behavior must be certified independently.

## First npm publish

The first publish bootstraps the package on npm and must be performed manually only after the exact navigation-first release candidate passes all gates above.

Before publishing, check the registry name again:

```bash
npm view react-native-scroll-interop
```

If the name exists unexpectedly, stop rather than publishing under a different identity.

Authenticate to npm and verify the active account:

```bash
npm login
npm whoami
```

`npm whoami` must print the intended maintainer account. If it returns `E401`, do not publish.

Run one final publish dry-run with release flags explicit:

```bash
npm publish --dry-run --access public --tag next
```

The notice must say `tag next`, and the tarball must contain only the release-controlled source surface. Generated paths such as `android/build`, `android/.gradle`, `android/.cxx`, `android/.kotlin` and `android/src/debug` must never be present.

Then publish with the same flags:

```bash
npm publish --access public --tag next
```

`prepublishOnly` runs the complete package checks automatically.

The first public version is:

```text
react-native-scroll-interop@0.1.0-alpha.1
```

## Trusted publishing after bootstrap

After the first package version exists on npm, configure npm Trusted Publishing for:

```text
GitHub owner: AmatoGiulio
Repository: react-native-scroll-interop
Workflow: publish-npm.yml
Allowed action: npm publish
```

The workflow lives at `.github/workflows/publish-npm.yml` and uses GitHub OIDC rather than a long-lived npm publish token.

For future alpha releases:

1. bump `package.json` and Android library version metadata to the same `0.1.0-alpha.N` version;
2. run the release candidate gate and freeze the exact commit;
3. create tag `v0.1.0-alpha.N` on that exact commit;
4. publish a GitHub Release from that tag;
5. the trusted-publishing workflow verifies the tag/version match and runs `npm publish --access public --tag next`;
6. confirm the new version is on npm under the `next` dist-tag.

## Stable release

Do not move npm `latest` or publish a stable version until the compatibility/support matrix is intentionally widened and a stable release gate is defined.
