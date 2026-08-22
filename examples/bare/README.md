# Bare React Native example

Minimal bare React Native 0.87 consumer for `react-native-scroll-interop`.

It installs the package from the repository root, uses standard React Native Android autolinking, applies the version-scoped bare compatibility adapter during `postinstall`, and renders the public `NativeScrollHost` + `MaterialTopAppBar` API.

## Run

```bash
npm install
npm run android
```

The example intentionally keeps React Native as the only touch/position/fling owner. The Material3 app bar participates in the same Android nested-scroll transaction exposed by the library.

This directory is repository-only validation material and is excluded from the npm tarball.
