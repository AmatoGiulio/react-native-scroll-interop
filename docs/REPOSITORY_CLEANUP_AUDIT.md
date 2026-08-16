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

`docs/HANDOFF_CURRENT.md` was updated to:

- use status date 2026-08-16;
- record React Native PR `#57972` as open;
- record that the Meta CLA is accepted;
- freeze the upstream branch except for maintainer-requested or demonstrated correctness changes;
- retain the RN 0.86 clean-remote-machine gate as pending;
- keep the RN-owned single-physics invariant explicit.

## Branch policy

Branches should be treated in three categories.

### Evidence / immutable

Checkpoint, `*-pass`, baseline and explicitly frozen branches are evidence. Do not force-push, retarget or reuse them for new work.

### Active

Current integration/gate branches may advance, but behavioral changes must originate from a demonstrated defect and must be revalidated against the relevant frozen checkpoint.

### Historical / WIP

Old research and WIP branches may eventually be pruned only after confirming that:

1. their unique finding is documented elsewhere;
2. no current documentation or automation relies on the branch;
3. no useful bisect/reference value would be lost.

This audit intentionally does not delete branches.

## Deferred cleanup

The following work is intentionally deferred because it is higher risk or requires a release decision rather than simple cleanup:

- changing the repository default branch;
- deleting historical/WIP branches;
- restructuring the Kotlin transport solely to reduce file size;
- reducing diagnostic probe coverage;
- changing package publication boundaries (`private`, `files`, npm contents, alpha versioning);
- modifying the RN 0.86 source patch while its remaining gate is remote reproducibility;
- modifying upstream PR `#57972` without review feedback or a demonstrated correctness issue.

## Current invariant

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native chrome consumers
```

Repository cleanup must never turn into a second momentum model, parent reconciliation of child scroll position, or sampled reconstruction of the source transaction.
