# Current handoff

Status date: 2026-08-16

This document is the source of truth for the current development handoff. It separates the completed RN 0.86 compatibility proof from the already-advanced RN 0.87+ architecture line and records the current React Native upstream status.

## Executive state

```text
local monorepo        PASS
fresh external app    PASS
clean remote machine  NEXT
RN upstream PR        OPEN (#57972)
```

The RN 0.86 technical proof is closed locally and in a fresh external Expo consumer. The only remaining gate for the RN 0.86 compatibility layer is a clean Android build/runtime run in CI/EAS on a machine with no prior repository state.

The RN 0.87 source-boundary fix has now been submitted upstream to React Native as `react/react-native#57972`. The PR is open, non-draft and mergeable; the Meta CLA has been accepted. Until maintainers review it, the upstream branch is frozen except for requested changes.

Do not interpret this as "RN 0.87 is next from scratch". RN 0.87+ already has validated multi-consumer architecture and production-hardening checkpoints; it is the main line after the RN 0.86 remote gate is closed.

## Current branch and protected checkpoint

Current gate branch:

```text
rn086-eas-ci-gate
```

Behavioral baseline for the gate:

```text
5db757d66e5442bc5b44afc42bc58ae09a3185c4
```

Frozen fresh-consumer proof:

```text
expo86-androidx-fresh-consumer-pass
5db757d66e5442bc5b44afc42bc58ae09a3185c4
```

The work branch may receive documentation or CI-gate commits on top. The frozen pass branch must remain pointing at the proven behavioral commit.

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

## RN 0.86: what is proven

A package/tarball installed into a fresh Expo SDK 57 / React Native 0.86.2 consumer completed the complete local integration path and behaved correctly at runtime.

Validated matrix:

```text
npm package / tarball         PASS
Expo config plugin            PASS
prebuild --clean              PASS
RN source build               PASS
ReactNestedScrollView         PASS
Android build/install         PASS
TopAppBar                     PASS
FloatingToolbar               PASS
NON_TOUCH feeling             PASS
fresh project isolation       PASS
```

This proves more than an in-repository experiment. The RN 0.86 compatibility path is consumable by an external Expo application through the normal config-plugin flow, without the old experimental patch runner.

## RN 0.86: exact fresh-consumer defect that was closed

React Native 0.86 exposes the vertical ScrollView manager through two creation paths in `MainReactPackage.kt`:

1. `createViewManagers()`;
2. `viewManagersMap`.

The earlier proof environment had normalized only one path, which hid a fresh-consumer defect. A clean RN 0.86.2 consumer exposed the second manager gate.

The production fix landed in:

```text
ea0fb8cc797cf9ed38e2f51053a61a8211604ad2
Handle both RN 0.86 ScrollView manager gates
```

That change makes `plugin/rn086AndroidXPatch.js` validate and normalize both expected manager entry points and fail closed on unknown or partial source shapes.

The final checkpoint is:

```text
5db757d66e5442bc5b44afc42bc58ae09a3185c4
Cover both RN 0.86 ScrollView manager entry points
```

`5db757d` adds/extends the plugin test fixtures and coverage so both creation paths, partially normalized sources, and fail-closed cases are exercised. Therefore `5db757d` is the correct final fresh-consumer checkpoint, while `ea0fb8c` is the commit containing the production patch that fixes both gates.

## RN 0.86 compatibility plugin: exact scope

The opt-in Expo config plugin is intentionally narrow. It:

1. configures React Native to build from source using the ReactAndroid/Hermes dependency substitutions needed by Expo's source-build path;
2. selects RN 0.86's existing `ReactNestedScrollViewManager` for vertical `RCTScrollView` in both `MainReactPackage.kt` creation paths;
3. changes the ordinary non-paging `ReactNestedScrollView.fling()` path from direct `mScroller.fling(...)` to `super.fling(correctedVelocityY)`.

The third point is architectural, not a new physics implementation: AndroidX owns the typed `TYPE_NON_TOUCH` nested-scroll transaction while React Native remains owner of its own fling physics and child movement.

The plugin does **not** implement or replace:

- native transport/dispatcher/ledger behavior;
- TopAppBar behavior;
- FloatingToolbar behavior;
- React child scroll position;
- a second momentum model.

Compatibility guarantees are intentionally fail-closed:

- accepted range is RN 0.86.x only;
- expected React Native source shape is validated before editing;
- unknown/partial source shapes fail prebuild;
- application is idempotent;
- existing source-build configuration is detected instead of duplicated.

The validated behavioral claim is standard non-paging vertical scrolling. `pagingEnabled`, snap-specific `flingAndSnap`, and other specialized RN 0.86 motion paths are not part of this proof.

See [`RN086_ANDROIDX_COMPAT.md`](RN086_ANDROIDX_COMPAT.md) for installation/configuration details.

## Architecture that must remain true

The project exists to satisfy one invariant:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native chrome consumers
```

React Native owns:

- touch gesture handling;
- fling physics;
- source movement;
- content position.

Native Material chrome participates in the source's real Android nested-scroll transaction.

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

TopAppBar is a real pre/post participant and can consume actual distance. FloatingToolbar observes/participates in the same transaction but consumes zero list distance for its behavior.

No parent reconciliation of child position is allowed.

## Source ownership and momentum lifecycle

The nested-scroll callback target is transaction authority. Tree discovery may prepare a source but is not itself authority.

A TOUCH stop must not trigger a terminal settle if the source has already opened a `TYPE_NON_TOUCH` momentum session. Settle waits for the momentum session to end.

Material receives the real distance of each fling frame through the transaction, so terminal settle must not integrate the same fling velocity a second time.

Source replacement and invalidation must clear stale momentum ownership. Callbacks from an inactive source must not mutate the current session.

## What is frozen during the remote RN 0.86 gate

Unless the clean remote build identifies a real defect in one of these areas, do not modify:

- `plugin/rn086AndroidXPatch.js`;
- the RN 0.86 plugin shape/fixture validation logic;
- `android-shared/` transaction/dispatcher/ledger behavior;
- native scroll transport and consumer semantics under `android/src/main/java/expo/modules/materialtoolbar/`;
- the validated public API used by the fresh consumer.

Do not "improve" the RN 0.86 patch while the only remaining question is remote reproducibility.

## Environmental failure already classified

A previous Android build failed with:

```text
No space left on device
```

A later complete clean build succeeded. That incident is classified as environmental and is not an open product regression.

Future CI/EAS failures must be classified before editing source code:

- source/product defect;
- dependency/build integration defect;
- environmental/infrastructure failure.

## Immediate next gate: clean remote machine

Run the validated RN 0.86 consumer path in CI/EAS on a machine with no previous clone/build/cache state that could mask missing integration steps.

Acceptance requires, at minimum:

```text
package/install              PASS
Expo config plugin           PASS
prebuild --clean             PASS
RN source build              PASS
Android compile/package      PASS
install/start                PASS
TopAppBar runtime            PASS
FloatingToolbar runtime      PASS
NON_TOUCH runtime            PASS
```

The purpose of this gate is reproducibility/industrialization. It is not an invitation to add new RN 0.86 features.

If the clean remote gate passes, create a new explicit checkpoint branch/SHA, record it in `CHECKPOINTS.md`, and freeze the RN 0.86 compatibility line for real alpha usage.

## RN 0.87+: already-established main line

RN 0.87+ already proved the production architecture. Important facts:

- the validated multi-consumer baseline is frozen at `9dbf12c2f19856e31291bfab16878f16fe314308`;
- one source-owned RN transaction can drive multiple Material consumers;
- production transport is source-owned only;
- parent-owned momentum proxy paths are research/control mechanisms and must not activate as production fallback;
- source binding is deterministic and screen-scoped;
- ambiguity fails closed;
- the RN patch belongs at the nested-scroll source boundary and must remain Material-agnostic;
- structural/analyzer PASS does not override a visible behavioral regression.

The RN 0.87 source issue is narrow: the source has AndroidX nested-scroll machinery, but the generated RN fling override can bypass the AndroidX NON_TOUCH entry point. That source-boundary fix is now represented by upstream PR `react/react-native#57972`; the module must continue to avoid constructing another scroller above React Native regardless of the upstream review outcome.

See:

- [`production-architecture-rn087.md`](production-architecture-rn087.md)
- [`production-readiness-rn087.md`](production-readiness-rn087.md)
- [`CHECKPOINTS.md`](CHECKPOINTS.md)

## Definition of done for this handoff state

RN 0.86 is done for the current compatibility milestone when:

1. the clean remote CI/EAS gate passes using the same normal consumer path;
2. the resulting exact SHA is recorded as a new frozen checkpoint;
3. no architecture workaround or second scroll model was introduced to obtain the pass;
4. the RN 0.86 compatibility line is frozen except for genuine release-blocking defects;
5. main development attention returns to the RN 0.87+ production line while upstream PR #57972 proceeds independently through review.
