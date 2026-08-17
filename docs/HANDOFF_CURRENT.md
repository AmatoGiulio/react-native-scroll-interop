# Current handoff

Status date: 2026-08-17

This document is the source of truth for the current development handoff. The RN 0.86 compatibility milestone is now closed through a clean remote EAS build plus installation/runtime verification. RN 0.87+ remains the established architecture line, and React Native upstream PR `#57972` proceeds independently.

## Executive state

```text
local monorepo        PASS
fresh external app    PASS
clean remote machine  PASS (EAS)
remote APK install    PASS
runtime recheck       PASS
RN upstream PR        OPEN (#57972)
```

The RN 0.86 compatibility line is frozen for alpha work except for genuine release-blocking defects.

## Frozen RN 0.86 checkpoints

Fresh-consumer behavioral checkpoint:

```text
expo86-androidx-fresh-consumer-pass
5db757d66e5442bc5b44afc42bc58ae09a3185c4
```

Final clean-remote checkpoint:

```text
expo86-androidx-clean-remote-pass
e8b27633accb5e2ffaa3d67d421cb5f6f846882a
```

The successful remote consumer was:

```text
AmatoGiulio/rn086-fresh-consumer
e11107ea3a32b6da12ee2659eb57935895e9127a
```

EAS completed the Android release build remotely. The produced APK was installed and launched in an emulator, where TopAppBar, FloatingToolbar, and expected NON_TOUCH behavior were manually confirmed working.

No scroll runtime, dispatcher, ledger, lifecycle, Material consumer, or RN 0.86 compatibility-plugin change was introduced to obtain the remote pass.

## React Native upstream status

Upstream pull request:

```text
https://github.com/react/react-native/pull/57972
Android: preserve NestedScrollView fling nested-scroll lifecycle
```

The upstream change is intentionally narrow:

- only the generated nested ScrollView path changes;
- ordinary non-paging `ReactNestedScrollView` flings delegate to `super.fling(correctedVelocityY)`;
- paging/snap remains on the existing `flingAndSnap()` path;
- React Native still initiates and owns fling physics and momentum events;
- the generator validates the expected copied scroller branch before replacing it.

The submitted runtime matrix covers ordinary low/high velocity flings, top/bottom edges, normal/fast deceleration, perf-tag use, paging, snap interval, snap offsets, `disableIntervalMomentum`, programmatic scroll, touch interruption and direction reversal. Ordinary deterministic fling endpoints remained identical between stock and patched source while the patched nested source opened the AndroidX `TYPE_NON_TOUCH` lifecycle.

Do not add unrelated changes to the upstream branch while review is pending. Any modification should be either a maintainer-requested adjustment or a directly demonstrated correctness issue in the submitted scope.

## RN 0.86: validated compatibility scope

The validated RN 0.86.2 / Expo SDK 57 path includes:

```text
npm package / tarball         PASS
Expo config plugin            PASS
prebuild --clean              PASS
RN source build               PASS
ReactNestedScrollView         PASS
Android build/install         PASS
TopAppBar                     PASS
FloatingToolbar               PASS
NON_TOUCH behavior            PASS
fresh project isolation       PASS
clean remote EAS build        PASS
remote artifact install/start PASS
```

The validated behavioral claim remains standard non-paging vertical scrolling. `pagingEnabled`, snap-specific `flingAndSnap`, and other specialized RN 0.86 motion paths are not part of this compatibility proof.

## RN 0.86 two-entry-point source fix

React Native 0.86 exposes the vertical ScrollView manager through both `createViewManagers()` and `viewManagersMap` in `MainReactPackage.kt`.

The production fix landed in:

```text
ea0fb8cc797cf9ed38e2f51053a61a8211604ad2
Handle both RN 0.86 ScrollView manager gates
```

The final fresh-consumer coverage checkpoint is:

```text
5db757d66e5442bc5b44afc42bc58ae09a3185c4
Cover both RN 0.86 ScrollView manager entry points
```

The compatibility plugin remains intentionally fail-closed and RN 0.86.x-only. It builds React Native from source, selects the existing nested ScrollView manager through both expected manager creation paths, and routes the ordinary non-paging nested fling through AndroidX `super.fling(correctedVelocityY)`.

It does **not** implement or replace the native transport/dispatcher/ledger, TopAppBar behavior, FloatingToolbar behavior, React child position, or a second momentum model.

## Architecture that must remain true

The project exists to satisfy one invariant:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native chrome consumers
```

React Native owns touch gesture handling, fling physics, source movement, and content position. Native consumers participate in the source's real Android nested-scroll transaction.

For a movement:

```text
source asks dy
 -> parent pre-scroll
 -> source scrolls its remainder itself
 -> parent post-scroll receives real childConsumed / dyUnconsumed
```

Accounting:

```text
requested = chromePre + childConsumed + chromePost + remaining
```

TopAppBar is a real pre/post participant. FloatingToolbar participates in the same transaction without becoming the owner of list movement. No parent reconciliation of child position is allowed.

The nested-scroll callback target is transaction authority. Tree discovery is preparation only. Stale source callbacks must not mutate the current session, and source replacement/invalidation must clear stale momentum ownership.

## Earlier infrastructure failures

A previous local Android build failed with `No space left on device`; a later complete build passed, so that incident remains classified as environmental.

The GitHub Actions clean-machine runs also did not execute the product path: GitHub allocated no runner (`runner_id=0`, `steps=[]`) because of an account billing/spending-limit block. Those runs are infrastructure failures, not product failures, and are superseded by the successful EAS clean-remote proof.

See [`REMOTE_GATE_STATUS.md`](REMOTE_GATE_STATUS.md) for the exact remote-gate record.

## RN 0.87+: established main architecture line

RN 0.87+ already has validated checkpoints for:

- multi-consumer behavior;
- source-boundary ownership;
- shared conservation ledger;
- shared kernel/dispatcher extraction;
- source-scoped lifecycle;
- production hardening.

Important references include:

```text
rn087-multi-consumer-baseline       9dbf12c2f19856e31291bfab16878f16fe314308
rn087-source-boundary-pass          1235266ef02c585a4cf262da46baffd73096972f
rn087-shared-ledger-pass            68ddcb63889b8729cdce6106a875db3c5e23268c
rn087-shared-kernel-bare-pass       f5256c8f56647a1cbbb84d7e432946bc8b329f56
rn087-shared-dispatcher-bare-pass   5246f1f3756859dffe5d2053e88f4b6e92d21417
rn087-lifecycle-source-scoped-pass  f9c62527192aa309eff0894ca1971aa07dd61c88
rn087-production-hardening-clean    65a5e89647263d82ce5b42621b195f75a064e050
rn087-production-hardening          f72015999d2ac225856c14d1ce0722ac35710947
```

Structural/analyzer PASS never overrides visible behavioral regression.

## Current development direction

The RN 0.86 compatibility milestone is complete and frozen. Main development attention can now return to the isolated neutral-core/RN 0.87+ line.

The active refactor branch is:

```text
refactor/neutral-native-scroll-core
```

Its first change is deliberately mechanical: the internal Kotlin host is renamed from `ExpoNestedScrollHostView` to `ReactNativeNestedScrollHostView`, while the current Expo native registration string remains unchanged for compatibility. Package/namespace extraction is a separate later step and must receive its own before/after build and invariant validation.

The upstream React Native PR and this library refactor remain separate concerns. Whether PR `#57972` is accepted or rejected, this library must never introduce a second scroll physics model.
