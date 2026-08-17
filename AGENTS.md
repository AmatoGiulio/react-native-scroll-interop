# Agent handoff

This file is the mandatory entry point for work on the native React Native scroll transport in this repository.

## Current work state

- Repository: `AmatoGiulio/material3-scroll`
- RN 0.86 fresh-consumer checkpoint: `expo86-androidx-fresh-consumer-pass` -> `5db757d66e5442bc5b44afc42bc58ae09a3185c4`
- Final RN 0.86 clean-remote checkpoint: `expo86-androidx-clean-remote-pass` -> `e8b27633accb5e2ffaa3d67d421cb5f6f846882a`
- Successful remote consumer: `AmatoGiulio/rn086-fresh-consumer` -> `e11107ea3a32b6da12ee2659eb57935895e9127a`
- RN 0.86 compatibility milestone: CLOSED / FROZEN for alpha except genuine release-blocking defects
- Current isolated refactor branch: `refactor/neutral-native-scroll-core`
- React Native upstream PR: `react/react-native#57972` OPEN

The successful EAS build ran remotely from the fresh consumer, produced an APK, and that artifact was installed/launched in an emulator. TopAppBar, FloatingToolbar, and expected NON_TOUCH behavior were manually confirmed working.

The repository default branch is historical relative to the RN 0.86/RN 0.87 work. Do not assume the default branch is the current development head.

## Read in this order

Before changing scroll behavior, read:

1. [`docs/HANDOFF_CURRENT.md`](docs/HANDOFF_CURRENT.md) - exact current status and development direction.
2. [`docs/WHAT_WAS_BUILT.md`](docs/WHAT_WAS_BUILT.md) - product boundary and accepted/rejected upstream strategy.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) - invariant and transaction model.
4. [`docs/production-architecture-rn087.md`](docs/production-architecture-rn087.md) - production architecture for the RN 0.87+ line.
5. [`docs/production-readiness-rn087.md`](docs/production-readiness-rn087.md) - proven and still-open RN 0.87+ hardening scope.
6. [`docs/RN086_ANDROIDX_COMPAT.md`](docs/RN086_ANDROIDX_COMPAT.md) - frozen RN 0.86 compatibility-plugin scope.
7. [`docs/CHECKPOINTS.md`](docs/CHECKPOINTS.md) - frozen behavioral references and pass branches.
8. [`TESTING.md`](TESTING.md) and repository analyzers/invariant checks before promoting a behavioral change.

`ROADMAP.md` contains historical planning material. It is not the source of truth for current scroll-transport status.

## Non-negotiable architecture

The governing invariant is:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native chrome consumers
```

React Native owns the gesture, fling physics, child movement, and child scroll position. Native Android consumers participate in the same real nested-scroll transaction.

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

If source or consumer ownership is ambiguous, fail closed rather than guessing.

## Source ownership and lifecycle

The Android nested-scroll callback target is transaction authority. Tree discovery is preparation only; it does not grant ownership.

Stale callbacks from a source that is no longer active must not mutate the current session. Source replacement/invalidation must clear old momentum ownership. Preserve the source-scoped lifecycle semantics proven on the RN 0.87 line.

A TOUCH stop must not perform terminal settle if the same source has already opened a `TYPE_NON_TOUCH` momentum session. Settle waits for the real momentum session to end.

## Frozen RN 0.86 compatibility line

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

Do not change the frozen RN 0.86 compatibility line for cleanup, naming, or speculative improvement. A new RN 0.86 change requires a separately demonstrated release-blocking defect and a new explicit validation checkpoint.

## RN 0.86 remote-gate evidence

The terminal checkpoint is:

```text
expo86-androidx-clean-remote-pass
e8b27633accb5e2ffaa3d67d421cb5f6f846882a
```

Remote consumer:

```text
AmatoGiulio/rn086-fresh-consumer
e11107ea3a32b6da12ee2659eb57935895e9127a
```

The EAS custom build applies/verifies the RN 0.86 patch before Gradle. The remote build completed, the APK installed/launched, and TopAppBar/FloatingToolbar/NON_TOUCH behavior was manually confirmed.

Earlier GitHub Actions attempts with `runner_id=0` and `steps=[]` were blocked by account billing/spending-limit configuration. They are infrastructure failures, not product failures.

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

## Neutral-core refactor discipline

The current refactor is intentionally isolated from the frozen RN 0.86 checkpoint and from the React Native upstream PR.

First mechanical step already prepared on `refactor/neutral-native-scroll-core`:

```text
ExpoNestedScrollHostView
→ ReactNativeNestedScrollHostView
```

The Expo native registration string remains unchanged in that first step so the validated JS/Expo adapter surface does not change.

Do not combine class renaming, package/namespace extraction, npm package splitting, publication-boundary changes, and behavior changes in one refactor. Move one dimension at a time and validate before promotion.

Core target layering:

```text
neutral native scroll core
React Native source adapter
Material3 consumers/adapters
Expo registration/packaging adapter
```

Expo and Material3 must not define the neutral core identity.

## Checkpoint discipline

Checkpoint/pass branches are evidence, not disposable work branches.

- Do not force-push or retarget a frozen `*-pass`/baseline branch.
- Do not rewrite a historical checkpoint to make a newer result look cleaner.
- Create a new explicit checkpoint when a new gate is proven.
- Record the exact commit SHA and what the checkpoint proves in `docs/CHECKPOINTS.md`.
- Keep experimental/research controls clearly separated from production transport.

## Before committing a behavioral change

A behavioral change is not complete because it compiles. At minimum, verify the relevant structural invariants, transaction accounting, TOUCH/NON_TOUCH lifecycle balance, source ownership, consumer coverage, and visual behavior. Use the existing invariant/analyzer scripts and the test matrix documented in this repository.
