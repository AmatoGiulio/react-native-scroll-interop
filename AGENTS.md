# Agent handoff

This file is the mandatory entry point for work on the native React Native scroll transport in this repository.

## Current work state

- Repository: `AmatoGiulio/material3-scroll`
- Current work branch: `rn086-eas-ci-gate`
- RN 0.86 behavioral baseline under the current gate: `5db757d66e5442bc5b44afc42bc58ae09a3185c4`
- Frozen RN 0.86 fresh-consumer checkpoint: `expo86-androidx-fresh-consumer-pass` -> `5db757d66e5442bc5b44afc42bc58ae09a3185c4`
- Immediate next gate: clean Android build/runtime validation in CI/EAS on a machine that has never seen this repository.

The work branch can move because documentation and CI-gate work may be committed on top. The frozen checkpoint branch is evidence and must not be retargeted.

The repository default branch is historical relative to the RN 0.86/RN 0.87 work. Do not assume the default branch is the current development head.

## Read in this order

Before changing scroll behavior, read:

1. [`docs/HANDOFF_CURRENT.md`](docs/HANDOFF_CURRENT.md) - exact current status and the next acceptance gate.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) - invariant and transaction model.
3. [`docs/production-architecture-rn087.md`](docs/production-architecture-rn087.md) - production architecture for the RN 0.87+ line.
4. [`docs/production-readiness-rn087.md`](docs/production-readiness-rn087.md) - what is proven and what still requires hardening on RN 0.87+.
5. [`docs/RN086_ANDROIDX_COMPAT.md`](docs/RN086_ANDROIDX_COMPAT.md) - exact RN 0.86 compatibility-plugin scope.
6. [`docs/CHECKPOINTS.md`](docs/CHECKPOINTS.md) - frozen behavioral references and pass branches.
7. [`TESTING.md`](TESTING.md) and the repository analyzers/invariant checks before promoting a behavioral change.

`ROADMAP.md` contains historical planning material. It is not the source of truth for current scroll-transport status.

## Non-negotiable architecture

The governing invariant is:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native chrome consumers
```

React Native owns the gesture, fling physics, child movement, and child scroll position. Native Material chrome participates in the same Android nested-scroll transaction.

For each movement, the accounting model is:

```text
requested = chromePre + childConsumed + chromePost + remaining
```

Every term comes from the current native transaction. Do not reconstruct motion from the previous frame.

## Never reintroduce

Do not reintroduce any of the following as production behavior:

- a parent-owned or proxy `OverScroller` that becomes a second scroll physics model;
- parent `scrollTo`, `scrollBy`, or equivalent commands to execute or reconcile React child movement;
- sampled `scrollY`/delta transport used to reconstruct momentum;
- per-frame JS callbacks for scroll/chrome synchronization;
- timer-based motion reconstruction;
- a second independent animation used to imitate the React Native fling;
- heuristic source ownership such as "largest visible scrollable" when the native transaction already identifies the source;
- a parent-started nested-scroll session that substitutes for the source-owned transaction;
- Material-specific behavior inside a React Native source patch.

If source or chrome ownership is ambiguous, fail closed rather than guessing.

## Source ownership and lifecycle

The Android nested-scroll callback target is transaction authority. Tree discovery is preparation only; it does not grant ownership.

Stale callbacks from a source that is no longer active must not be allowed to mutate the current session. Source replacement/invalidation must clear old momentum ownership. Preserve the source-scoped lifecycle semantics proven on the RN 0.87 line.

## RN 0.86 compatibility line

The RN 0.86 layer exists only to make the validated architecture consumable on React Native 0.86.x through the Expo config plugin.

The plugin intentionally does only the compatibility work documented in `docs/RN086_ANDROIDX_COMPAT.md`:

1. build React Native from source;
2. select RN 0.86's existing `ReactNestedScrollViewManager` for vertical `RCTScrollView` through both `MainReactPackage.kt` manager creation paths;
3. route the ordinary non-paging `ReactNestedScrollView.fling()` through AndroidX `super.fling(correctedVelocityY)` so AndroidX owns the typed `TYPE_NON_TOUCH` nested-scroll transaction while React Native still owns fling physics.

It must not become a second implementation of the library transport, dispatcher, ledger, TopAppBar behavior, FloatingToolbar behavior, or child scroll state.

Compatibility is intentionally fail-closed:

- RN 0.86.x only;
- expected source shapes are validated;
- unknown/partial source shapes fail prebuild instead of receiving a best-effort patch;
- repeated application must remain idempotent;
- existing source-build configuration must not be duplicated.

The validated claim is standard non-paging vertical scrolling. Do not extend the claim to `pagingEnabled`, snap-specific paths, or other unvalidated RN 0.86 motion paths without a separate gate.

## RN 0.86 gate discipline

The local monorepo proof and fresh external Expo consumer proof are complete. While the remote clean-machine gate is pending, do not add unrelated RN 0.86 behavior.

Treat these areas as frozen unless the remote gate itself demonstrates a defect that requires a change:

- `plugin/rn086AndroidXPatch.js`;
- RN 0.86 patch validation scripts/fixtures;
- `android/src/main/java/expo/modules/materialtoolbar/` scroll transport and Material consumers;
- `android-shared/` transport/dispatcher/ledger logic;
- the public JS/native API used by the validated consumer.

A CI/EAS failure must first be classified: product/source-shape bug, dependency/build integration bug, or environmental/infrastructure failure. Do not change scroll architecture to cure an environmental failure.

After the clean remote gate passes, freeze the RN 0.86 compatibility line for alpha work instead of continuing to expand it.

## RN 0.87+ line

RN 0.87 is not a future-from-scratch task. It already has validated architecture and hardening checkpoints.

Key references include:

- `rn087-multi-consumer-baseline` -> `9dbf12c2f19856e31291bfab16878f16fe314308`
- `rn087-source-boundary-pass` -> `1235266ef02c585a4cf262da46baffd73096972f`
- `rn087-shared-ledger-pass` -> `68ddcb63889b8729cdce6106a875db3c5e23268c`
- `rn087-shared-kernel-bare-pass` -> `f5256c8f56647a1cbbb84d7e432946bc8b329f56`
- `rn087-shared-dispatcher-bare-pass` -> `5246f1f3756859dffe5d2053e88f4b6e92d21417`
- `rn087-lifecycle-source-scoped-pass` -> `f9c62527192aa309eff0894ca1971aa07dd61c88`
- `rn087-production-hardening-clean` -> `65a5e89647263d82ce5b42621b195f75a064e050`
- `rn087-production-hardening` / `alpha-prep` -> `f72015999d2ac225856c14d1ce0722ac35710947`

The frozen multi-consumer baseline is a behavioral reference. Numeric analyzer success cannot override a visible behavioral regression.

## Checkpoint discipline

Checkpoint/pass branches are evidence, not disposable work branches.

- Do not force-push or retarget a frozen `*-pass`/baseline branch.
- Do not rewrite a historical checkpoint to make a newer result look cleaner.
- Create a new explicit checkpoint when a new gate is proven.
- Record the exact commit SHA and what the checkpoint proves in `docs/CHECKPOINTS.md`.
- Keep experimental/research controls clearly separated from production transport.

## Before committing a behavioral change

A behavioral change is not complete because it compiles. At minimum, verify the relevant structural invariants, transaction accounting, TOUCH/NON_TOUCH lifecycle balance, source ownership, consumer coverage, and visual behavior. Use the existing invariant/analyzer scripts and the test matrix documented in this repository.
