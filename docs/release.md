# Release status

Package: `react-native-scroll-interop`

Current version: `0.1.0-alpha.1`

Publication dist-tag: `next`

## Recorded certification baseline

PR #26 completed the architecture separation for this alpha and was merged as:

```text
main merge commit: da1c07f04a306d4596da2d1a5d802580eeddf287
certified PR head: d397d7011f9d4487ac1f65633505141089d7069a
certified tree:    972e21f2289692d989000ab8ecef1ff337db8074
```

The PR head and merge commit point to the same tree. The evidence below applies exactly to that
tree; it must not be presented as certification of later runtime changes.

## PR #26 certification record

### Static/package gates

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

Recorded baseline package surface: 58 files, 258133 bytes unpacked. This is a historical
measurement, not the expected byte size of a later documentation-frozen tarball.

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

Touch scroll, fling, reverse fling, large TopAppBar collapse/expand, and navigation source restoration were verified without visible jump, double-consume, stale ownership, or crash.

### Bare React Native 0.87.0-rc.3

```text
exact tarball install                             PASS
standard RN autolinking                           PASS
bare compatibility adapter                        PASS
:react-native-scroll-interop:compileDebugKotlin   PASS
:app:assembleDebug                                PASS
:app:installDebug                                 PASS
Hermes runtime                                    PASS
```

`NativeScrollHost` + large `MaterialTopAppBar`, touch, fling, reverse fling, collapse, and expand were verified without visible jump, double-consume, abnormal stutter, or crash.

## Repository examples

The public repository keeps two maintained consumer shapes visible under `examples/`:

```text
examples/expo   Expo SDK 57 / React Native 0.86
examples/bare   bare React Native 0.87
```

`examples/expo` is the maintained Expo consumer. `examples/bare` is a stable RN 0.87 consumer derived from the previously validated bare probe, simplified to use the current public package API and standard autolinking. The recorded release certification remains the exact RN `0.87.0-rc.3` gate above until the stable RN 0.87 example is rerun and recorded separately.

Both examples are repository-only and must remain outside the npm package.

## Current candidate evidence boundary

Static checks and successful repository builds can establish release readiness, but they do not
retroactively transfer the PR #26 runtime certification to a different source tree. If the final
publication candidate differs from the certified tree in native or runtime code, repeat the exact
tarball install and relevant device/runtime gates before calling that candidate certified.

Documentation-only changes still require the publication commands below because `README.md` is part
of the npm tarball. They do not require a new runtime claim when the packed runtime files are
unchanged.

## Public alpha publication gate

Before publishing, the GitHub repository must be public so the package metadata links are reachable.

Then run from documentation-frozen `main`:

```bash
npm run check
npm pack --dry-run
npm publish --dry-run --access public --tag next
```

The tarball must contain only the public runtime/integration surface and must not contain `examples/`, `scripts/`, `.github/`, `docs/`, Android build output, historical Expo implementation sources, or other repository-only material.

When the dry-run is clean:

```bash
npm publish --access public --tag next
```

Do not publish this alpha under `latest`.

## Post-publish verification

```bash
npm view react-native-scroll-interop@next version
npm view react-native-scroll-interop dist-tags
```

Then install `react-native-scroll-interop@next` from the registry in a fresh consumer and verify the minimal Android build/install path.

## Independent upstream work

Two open upstream changes move responsibilities toward their existing owners:

1. [React Native #57972](https://github.com/react/react-native/pull/57972) preserves AndroidX
   `TYPE_NON_TOUCH` nested-scroll lifecycle for ordinary `ReactNestedScrollView` flings. React
   Native still initiates and owns the fling.
2. [react-native-screens #4537](https://github.com/software-mansion/react-native-screens/pull/4537)
   exposes a neutral Android nested-scroll delegate seam. Screens keeps ownership, existing behavior,
   and first priority.

The PRs address different layers and neither is a blocker for `0.1.0-alpha.1`. The package already
has narrow, fail-closed compatibility paths for the versions in the current peer range, including a
validated version-scoped `react-native-screens 4.26.x` adapter.

## Stable-release bar

Before using `latest`:

- certify supported stable React Native lines;
- broaden the explicit Android device/API regression matrix;
- settle the preferred `react-native-screens` ownership path;
- document migration behavior across supported RN/screens ranges;
- continue proving that no consumer duplicates source physics or velocity integration.

See [`roadmap.md`](./roadmap.md).
