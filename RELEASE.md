# Release process

Public package: `react-native-scroll-interop`

Current release line: `0.1.0-alpha.x`

Alpha releases use the npm dist-tag `next`. Do not publish an alpha as `latest`.

## First-public-alpha blocker

Do **not** publish `0.1.0-alpha.1` until the navigation-first product shape is validated on the exact release candidate.

The required public shape is:

```text
Stack / navigator
└── MaterialTopAppBar per route

navigation layout
└── one persistent MaterialToolbar

screen
└── NativeScrollHost
    └── React Native vertical scroll source
```

The screen must not need to repeat TopAppBar or FloatingToolbar declarations.

## Release candidate gate

Before publishing a version, freeze and validate one exact commit:

1. `npm run check`;
2. `npm pack --dry-run` and inspect the package surface;
3. install the exact tarball in an external RN 0.86.2 consumer under the public package name;
4. verify the Expo config plugin resolves as `react-native-scroll-interop`;
5. run the Expo Router SDK 57 navigation-first gate;
6. run the React Navigation native-stack navigation-first gate;
7. create a new immutable `*-pass` checkpoint for the exact tested commit.

Do not repoint a frozen release checkpoint.

### Expo Router navigation-first gate

Use the exact release tarball in an Expo SDK 57 / RN 0.86.2 consumer.

Required structure:

- `MaterialTopAppBar` declared directly in `Stack.Screen` through `Stack.Header asChild`;
- transparent custom Stack header;
- one persistent `MaterialToolbar.Root` in the route layout;
- screen files contain `NativeScrollHost` + scroll source, with no repeated TopAppBar/FloatingToolbar.

Runtime validation:

- Android prebuild/build/install;
- Home ordinary scroll + fling;
- navigate Home -> Details;
- Details ordinary scroll + fling;
- native Material back button returns to Home;
- new Home scroll after return;
- persistent FloatingToolbar/FAB still responds to the active screen source;
- no duplicate/ambiguous chrome binding or stale transaction behavior.

### React Navigation navigation-first gate

Use the exact same release tarball with React Navigation native stack.

Required structure:

- `MaterialTopAppBar` supplied through the native stack custom `header` option;
- `headerTransparent: true`;
- one persistent `MaterialToolbar.Root` around the navigator;
- host navigator supplies back ownership through `navigation.goBack()`;
- screen content does not declare duplicate chrome.

Runtime validation matches the Expo Router gate: scroll/fling on both screens, forward navigation, native Material back, return/new scroll, persistent toolbar and no ambiguous binding.

`screenLayout` may be tested as an optional React Navigation convenience for centralizing `NativeScrollHost`; it is not required for first-alpha transport correctness.

## First npm publish

The first publish bootstraps the package on npm and must be performed manually only after the exact navigation-first release candidate has passed all gates above.

Before publishing, check the registry name again:

```bash
npm view react-native-scroll-interop
```

For an unpublished name npm should report that the package is not present. If the name exists unexpectedly, stop rather than publishing under a different identity.

Authenticate to npm and verify the active account before publishing:

```bash
npm login
npm whoami
```

`npm whoami` must print the intended maintainer account. If it returns `E401`, do not publish yet.

Run one final publish dry-run with the release tag and access flags explicit:

```bash
npm publish --dry-run --access public --tag next
```

The publish notice must say `tag next`, and the tarball must contain only the release-controlled source surface. Generated paths such as `android/build`, `android/.gradle`, `android/.cxx`, `android/.kotlin` and `android/src/debug` must never be present.

Then publish with the same explicit release flags:

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

Do not move the npm `latest` dist-tag or publish a stable version until the compatibility/support matrix is intentionally widened and a stable release gate is defined.
