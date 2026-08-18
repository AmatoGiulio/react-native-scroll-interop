# Release process

Public package: `react-native-scroll-interop`

Current release line: `0.1.0-alpha.x`

Alpha releases use the npm dist-tag `next`. Do not publish an alpha as `latest`.

## Release candidate gate

Before publishing a version, freeze and validate one exact commit:

1. `npm run check`;
2. `npm pack --dry-run` and inspect the package surface;
3. install the exact tarball in the external RN 0.86.2 fresh consumer under the public package name;
4. verify the Expo config plugin resolves as `react-native-scroll-interop`;
5. build/install Android and run the release smoke for ordinary scroll, NON_TOUCH fling, NativeTabs away/return, TopAppBar and FloatingToolbar/FAB;
6. create a new immutable `*-pass` checkpoint for the exact tested commit.

Do not repoint a frozen release checkpoint.

## First npm publish

The first publish bootstraps the package on npm and must be performed manually from the exact frozen release commit.

Before publishing, check the registry name again:

```bash
npm view react-native-scroll-interop
```

For an unpublished name npm should report that the package is not present. If the name exists unexpectedly, stop rather than publishing under a different identity.

Then authenticate to npm with the maintainer account and publish:

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
Repository: material3-scroll
Workflow: publish-npm.yml
Allowed action: npm publish
```

The workflow lives at `.github/workflows/publish-npm.yml` and uses GitHub OIDC rather than a long-lived npm publish token.

For future alpha releases:

1. bump `package.json` and Android library version metadata to the same `0.1.0-alpha.N` version;
2. run the release candidate gate and freeze the exact commit;
3. create tag `v0.1.0-alpha.N` on that exact commit;
4. publish a GitHub Release from that tag;
5. the trusted-publishing workflow verifies the tag/version match and runs `npm publish`;
6. confirm the new version is on npm under the `next` dist-tag.

## Stable release

Do not move the npm `latest` dist-tag or publish a stable version until the compatibility/support matrix is intentionally widened and a stable release gate is defined.
