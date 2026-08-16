# Repository cleanup audit

Status date: 2026-08-16

This audit records the conservative repository cleanup performed while React Native upstream PR `react/react-native#57972` is awaiting review.

The cleanup rule is simple: preserve validated behavior and evidence; remove only clearly temporary repository artifacts; defer behavioral refactors until the upstream/source-boundary state is stable.

## Protected / KEEP

The following categories are evidence or active production work and must not be deleted merely because they look experimental:

- all documented `*-pass` checkpoint branches;
- `rn087-multi-consumer-baseline` and other frozen RN 0.87 reference branches;
- `expo86-androidx-fresh-consumer-pass` at `5db757d66e5442bc5b44afc42bc58ae09a3185c4`;
- `android-shared/` dispatcher, lifecycle and conservation ledger;
- `android/src/main/java/expo/modules/materialtoolbar/` production transport and consumers;
- RN 0.86 compatibility plugin and its fixtures/checks;
- diagnostic applications/probes that reproduce lifecycle, source replacement, navigation, orientation, list-type or transaction behavior;
- log analyzers and static invariant gates;
- documentation that records measured checkpoints and regression evidence.

## Removed in this cleanup

The following files were removed because they were temporary markers/inspection artifacts and repository search found no consumers:

- `noop.txt`;
- `tmp-expo57-matrix.txt`;
- `tmp-package-content.json`;
- `example/package-fixed.json`.

No runtime or test behavior depends on these files.

## Documentation normalization

The cleanup branch updates documentation to match the current state:

- `docs/HANDOFF_CURRENT.md` uses status date 2026-08-16 and records upstream PR `#57972`, accepted CLA and the still-separate RN 0.86 clean-remote gate;
- `docs/production-readiness-rn087.md` no longer describes the source fix as pre-upstream: the PR is already open and its explicit regression matrix is separated from remaining production gaps;
- the root `README.md` no longer presents the repository as merely an Expo 55 compatibility branch and points readers to the handoff/checkpoint source of truth;
- the stale GitHub default branch is identified as legacy rather than silently treated as current.

## Current GitHub default branch

The repository default branch is currently:

```text
topappbar-inset-and-host-unification
```

It is a historical development branch, not the current source of truth. Compared with `rn086-eas-ci-gate`, the current gate line is 216 commits ahead and 0 behind.

Do not casually fast-forward or force-move the default branch while the cleanup PR is under review. Changing the default branch is a repository-level operation with consequences for clones, links and future PR bases; it should happen as an explicit normalization step after the documentation/cleanup diff is accepted.

Until then, the canonical orientation documents are:

- `docs/HANDOFF_CURRENT.md` for active state;
- `docs/CHECKPOINTS.md` for immutable evidence;
- this audit for cleanup/branch policy.

## Branch classification

Branches are treated in four operational categories.

### 1. Evidence / immutable

These must be preserved and not retargeted or force-pushed:

- every documented `*-pass` branch;
- `rn087-multi-consumer-baseline`;
- `rn-087-nested-scroll` where it is used as a recorded reference;
- `rn087-production-hardening-clean`;
- `rn087-production-hardening` and `alpha-prep` as documented production-hardening references;
- RN 0.86 frozen compatibility checkpoints listed in `docs/CHECKPOINTS.md`.

Several focused Expo 0.86 pass branches are also useful evidence even when superseded by the fresh-consumer proof, including list-type, visual, dispatcher, ledger, navigation/orientation and source-replacement passes. Superseded does not mean disposable.

### 2. Active / current work

Current work branches may advance, but should not be rewritten casually:

- `rn086-eas-ci-gate` — RN 0.86 clean-remote reproducibility gate;
- `cleanup/state-consolidation-2026-08-16` — documentation/repository hygiene only;
- `rn087-upstream-react-native-pr` / `rn087-upstream-regression-matrix` / `rn086-upstream-prep` where still useful as local upstream preparation/evidence branches.

The actual public React Native PR branch lives in `react/react-native` and must remain narrow during upstream review.

### 3. Legacy / historical development lines

These are not candidates for immediate deletion. They may retain unique bisect or architecture history, but they should not be treated as current development heads merely because they exist:

- `topappbar-inset-and-host-unification` — currently the GitHub default, but materially stale relative to the current gate line;
- `rn-owned-scroll-transaction` and other older architecture/prototype lines not listed as pass checkpoints;
- non-pass stress `base`, `ready`, `tree` and `wip` branches whose validated outcomes are preserved in corresponding pass/log-pass branches.

Pruning requires proof that each branch has no unique finding or useful reference value not captured elsewhere.

### 4. Temporary / prune candidates

A branch name alone is not enough to delete it. `tmp-noop` was inspected specifically because it looks disposable.

`tmp-noop` points at commit:

```text
15c94a9fbb613aca5645b4c39cf9b2c58db68638
Preserve RN fling parameters while priming AndroidX nesting
```

`rn086-eas-ci-gate` is 165 commits ahead and 0 behind that branch, so its tip is already contained in the current history. This makes `tmp-noop` a strong future prune candidate.

It is intentionally **not deleted in this cleanup PR**. Branch deletion is separated from documentation/file cleanup so that history removal remains an explicit operation after review.

## Branch deletion rule

Before deleting any branch, verify all of the following:

1. the branch tip is contained in a preserved branch or its unique commits are intentionally archived elsewhere;
2. it is not listed in `docs/CHECKPOINTS.md` as evidence;
3. no current documentation, automation, PR or reproducibility workflow relies on its name;
4. it is not the current default branch;
5. deletion does not remove the only convenient reference for a measured validation run.

No branch deletion is performed by this cleanup PR.

## Deferred cleanup

The following work is intentionally deferred because it is higher risk or requires a release/repository decision rather than simple cleanup:

- changing the repository default branch;
- deleting historical/WIP branches;
- restructuring the Kotlin transport solely to reduce file size;
- reducing diagnostic probe coverage;
- changing package publication boundaries (`private`, `files`, npm contents, alpha versioning);
- modifying the RN 0.86 source patch while its remaining gate is remote reproducibility;
- modifying upstream PR `#57972` without review feedback or a demonstrated correctness issue.

## Packaging status

The root package currently remains:

```text
name:    expo-material-toolbar
version: 2.0.0-alpha.25
private: true
```

There is no reason to mix npm publication cleanup into this repository hygiene PR. When publication work begins, it should be treated as a separate gate with an explicit package file set, `npm pack` inspection and a fresh-consumer install/build/runtime test.

## Current invariant

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native chrome consumers
```

Repository cleanup must never turn into a second momentum model, parent reconciliation of child scroll position, or sampled reconstruction of the source transaction.
