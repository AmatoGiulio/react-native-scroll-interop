# Release status

Package: `react-native-scroll-interop`

Current version: `0.1.0-alpha.1`

Planned npm dist-tag: `next`

Current npm status: **not published yet**.

## Release candidate source

PR #26 completed the architecture separation for this alpha and was merged as:

```text
main merge commit: da1c07f04a306d4596da2d1a5d802580eeddf287
certified PR head: d397d7011f9d4487ac1f65633505141089d7069a
certified tree:    972e21f2289692d989000ab8ecef1ff337db8074
```

The PR head and the merge commit point to the same tree, so the runtime/package source that was validated is exactly the source merged to `main`.

The public-release documentation hardening that follows PR #26 is documentation/check-surface only. No native runtime behavior should be changed as part of that release-preparation pass.

## Architecture shipped by this alpha

- neutral nested-scroll core under `com.reactnativescroll.interop.core`;
- React Native source recognition, parent facade/engine, `NativeScrollHost`, and screen bridge under `com.reactnativescroll.interop.reactnative`;
- native consumers supplied through `ReactNativeNestedScrollParticipantProvider` / `ReactNativeNestedScrollParticipantSession`;
- Material3 behavior consumers under `com.reactnativescroll.interop.material3`;
- Material3 native UI/managers/registry/provider under `com.reactnativescroll.interop.material3.ui`;
- `ReactNativeScrollInteropPackage` as the standard RN composition root;
- Expo Router and React Navigation as thin adapters over one internal navigator-neutral mapper/header renderer;
- current `react-native-screens 4.26.x` support through the package adapter, with the future upstream path kept AndroidX-only and package-neutral.

Expo Modules are not required by the native runtime.

## Final-head certification completed for PR #26

### Static/package gates

Validated on exact PR head `d397d7011f9d4487ac1f65633505141089d7069a`:

```text
npm run check                                      PASS
npm pack --dry-run                                 PASS
architecture boundary                             PASS
scroll/Material3 invariants                       PASS
Expo Router / React Navigation mapping            PASS
RN 0.86 / 0.87 compatibility adapters             PASS
react-native-screens 4.26.x bridge invariant      PASS
package surface                                   PASS
```

Recorded package surface for that gate:

```text
58 files
258133 bytes unpacked
```

### Expo SDK 57 / React Native 0.86.0

Fresh consumer validation from the exact package artifact:

```text
exact tarball install                             PASS
clean Expo prebuild                               PASS
clean react-native-screens 4.26.2 integration     PASS
:react-native-scroll-interop:compileDebugKotlin   PASS
:app:assembleDebug                                PASS
install/runtime/navigation                        PASS
```

Runtime observations:

- app launches without crash;
- touch scroll works;
- fling and reverse fling work;
- large `MaterialTopAppBar` collapses and expands correctly;
- forward/back navigation restores source ownership correctly;
- no visible jump, double-consume, stale toolbar/app-bar ownership, or crash observed.

### Bare React Native 0.87.0-rc.3

Fresh consumer validation from the exact package artifact:

```text
exact tarball install                             PASS
standard RN autolinking                           PASS
bare compatibility adapter                        PASS
:react-native-scroll-interop:compileDebugKotlin   PASS
:app:assembleDebug                                PASS
:app:installDebug                                 PASS
Hermes runtime                                    PASS
```

Runtime observations:

- `Hermes: YES` confirmed in the runtime probe;
- `NativeScrollHost` + large `MaterialTopAppBar` render correctly;
- touch scroll, fling, reverse fling, collapse, and expand work correctly;
- no visible jump, double-consume, abnormal stutter, or crash observed.

## Public alpha publication gate

Before publishing `0.1.0-alpha.1`, run from the documentation-frozen `main` commit:

```bash
npm run check
npm pack --dry-run
npm publish --dry-run --access public --tag next
```

Inspect the dry-run tarball and verify that it contains the public runtime surface only:

- neutral core;
- generic React Native boundary;
- Material3 reference consumers/UI;
- root API;
- `/router` adapter;
- `/react-navigation` adapter;
- Expo config plugin / bare compatibility helpers;
- `README.md`, `LICENSE`, and `package.json`.

It must not contain repository/test/generated material such as:

- `example/`;
- `scripts/`;
- `.github/`;
- Android build output;
- historical Expo implementation sources;
- repository-only architecture/release/upstream/roadmap documents.

When the dry-run is clean:

```bash
npm publish --access public --tag next
```

Do not publish this alpha under `latest`.

## Post-publish verification

Immediately after publication:

```bash
npm view react-native-scroll-interop@next version
npm view react-native-scroll-interop dist-tags
```

Expected version:

```text
0.1.0-alpha.1
```

Then install `react-native-scroll-interop@next` from the registry in a fresh consumer and verify that the registry artifact, not a local tarball/workspace link, completes the minimal Android build/install path.

## Relationship to react-native-screens upstream work

The upstream-neutral `react-native-screens` seam is valuable but is **not a blocker for this alpha**.

The current package already has a validated, version-scoped `react-native-screens 4.26.x` adapter. If the upstream AndroidX delegate seam is accepted and released, a later package version should migrate to that seam and remove the source-patch requirement for supported screens versions.

## Stable-release bar

Before using the npm `latest` tag, the project should have at minimum:

- fresh validation on the supported stable React Native lines rather than only release candidates;
- a broader, explicit Android device/API regression matrix;
- a settled `react-native-screens` ownership path;
- documented migration behavior across supported RN/screens ranges;
- continued proof that no consumer path duplicates source physics or velocity integration.

See [`ROADMAP.md`](./ROADMAP.md) for the forward plan.
