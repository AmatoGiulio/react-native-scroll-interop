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

## Final-head certification completed for PR #26

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

Recorded package surface: 58 files, 258133 bytes unpacked.

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

## Public alpha publication gate

Before publishing, the GitHub repository must be public so the package metadata links are reachable.

Then run from documentation-frozen `main`:

```bash
npm run check
npm pack --dry-run
npm publish --dry-run --access public --tag next
```

The tarball must contain only the public runtime/integration surface and must not contain `example/`, `scripts/`, `.github/`, `docs/`, Android build output, historical Expo implementation sources, or other repository-only material.

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

## Relationship to react-native-screens upstream work

The upstream-neutral `react-native-screens` seam is valuable but is **not a blocker for this alpha**. The current package already has a validated, version-scoped `react-native-screens 4.26.x` adapter.

## Stable-release bar

Before using `latest`:

- certify supported stable React Native lines;
- broaden the explicit Android device/API regression matrix;
- settle the preferred `react-native-screens` ownership path;
- document migration behavior across supported RN/screens ranges;
- continue proving that no consumer duplicates source physics or velocity integration.

See [`roadmap.md`](./roadmap.md).
