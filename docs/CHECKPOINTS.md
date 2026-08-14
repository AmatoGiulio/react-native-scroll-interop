# Validated checkpoints

This document records meaningful pass/reference branches for the native scroll architecture. These branches are evidence. Do not retarget or force-push them to newer commits.

This is intentionally not a catalog of every experimental branch. It lists checkpoints that define a proven behavior, a compatibility gate, or a production-hardening reference.

## RN 0.86 compatibility line

| Checkpoint | Commit | What it proves |
| --- | --- | --- |
| `expo86-androidx-nontouch-pass` / `rn086-androidx-backport` | `270cdfedc6a3981c03052a4c3489d7e7da6c7187` | RN 0.86 AndroidX compatibility experiment accepts RN 0.86 patch releases and demonstrates the NON_TOUCH direction. |
| `rn086-androidx-industrialization` | `00ce738f60395cbcf9a8e2422407517f2df5d6f6` | Validated experiment patches were normalized toward the production config-plugin path. |
| `expo86-androidx-industrialized-pass` | `a0505e6e324ae1113525c54c3790f572567fdaf4` | Expanded plugin hardening/tests after the RN 0.86 compatibility path was industrialized. |
| `expo86-androidx-fresh-consumer-pass` | `5db757d66e5442bc5b44afc42bc58ae09a3185c4` | Fresh external Expo SDK 57 / RN 0.86.2 consumer: tarball install, config plugin, clean prebuild, RN source build, Android install/runtime, TopAppBar, FloatingToolbar, and NON_TOUCH behavior all pass. |
| `rn086-eas-ci-gate` | starts from `5db757d66e5442bc5b44afc42bc58ae09a3185c4` | Work branch for the remaining clean-remote-machine CI/EAS reproducibility gate. This branch may advance; it is not itself a frozen pass checkpoint until that gate is proven. |

### Fresh-consumer two-entry-point fix

The final fresh-consumer checkpoint contains two distinct pieces of evidence that should not be conflated:

```text
ea0fb8cc797cf9ed38e2f51053a61a8211604ad2
Handle both RN 0.86 ScrollView manager gates
```

This is the production plugin change that validates and normalizes both `MainReactPackage.kt` vertical ScrollView manager creation paths.

```text
5db757d66e5442bc5b44afc42bc58ae09a3185c4
Cover both RN 0.86 ScrollView manager entry points
```

This is the final checkpoint/test-coverage commit that exercises both paths, partially normalized shapes, and fail-closed behavior. The frozen fresh-consumer branch correctly points at this commit.

### Additional RN 0.86 behavior checkpoints

The repository also contains focused pass branches for ScrollView/FlatList/SectionList/FlashList, source/navigation/orientation stress, TopAppBar visual behavior, FloatingToolbar-only behavior, shared dispatcher, and shared ledger work. They remain useful for bisect/reference work, but the fresh-consumer checkpoint above supersedes them as the current RN 0.86 compatibility proof.

## RN 0.87+ architecture and hardening line

| Checkpoint | Commit | What it proves |
| --- | --- | --- |
| `rn-087-nested-scroll` | `9dbf12c2f19856e31291bfab16878f16fe314308` | Validated RN 0.87 nested-scroll/multi-consumer behavior. |
| `rn087-multi-consumer-baseline` | `9dbf12c2f19856e31291bfab16878f16fe314308` | Frozen behavioral reference for one RN-owned source transaction driving multiple Material consumers. |
| `rn087-source-boundary-pass` | `1235266ef02c585a4cf262da46baffd73096972f` | Source-boundary work after the multi-consumer baseline. |
| `rn087-shared-ledger-pass` | `68ddcb63889b8729cdce6106a875db3c5e23268c` | Shared transaction-accounting/ledger behavior passes. |
| `rn087-shared-kernel-bare-pass` | `f5256c8f56647a1cbbb84d7e432946bc8b329f56` | Shared kernel behavior validated in the bare RN 0.87 path. |
| `rn087-shared-dispatcher-bare-pass` | `5246f1f3756859dffe5d2053e88f4b6e92d21417` | Shared dispatcher behavior validated in the bare RN 0.87 path. |
| `rn087-lifecycle-source-scoped-pass` | `f9c62527192aa309eff0894ca1971aa07dd61c88` | Lifecycle is scoped to the active source: callback target is transaction authority, stale source callbacks are ignored, and source replacement/invalidation clears stale momentum ownership. |
| `rn087-production-hardening-clean` | `65a5e89647263d82ce5b42621b195f75a064e050` | Clean production-hardening checkpoint before the later alpha-prep state. |
| `rn087-production-hardening` | `f72015999d2ac225856c14d1ce0722ac35710947` | Production-hardening line used as the base for subsequent RN 0.86 compatibility work. |
| `alpha-prep` | `f72015999d2ac225856c14d1ce0722ac35710947` | Alpha-preparation reference at the same production-hardening commit. |

## Protected behavioral meaning

The RN 0.87 multi-consumer baseline is a behavioral reference, not merely a green analyzer result.

Representative validated evidence documented for the RN 0.87 line includes balanced TOUCH/NON_TOUCH sessions, zero broken complete frames, zero unexpected orphan frames, and full FloatingToolbar coverage for the measured touch and momentum frames. See `production-readiness-rn087.md` for the exact recorded numbers and scope.

A future change must not be promoted solely because structural checks pass. Visual/interaction equivalence to the frozen behavioral reference remains a gate.

## Checkpoint rules

1. A `*-pass`, baseline, or explicitly frozen checkpoint branch is immutable evidence.
2. Do not force-push, retarget, or rewrite one to point at a newer result.
3. If a new gate passes, create a new named checkpoint and record the exact SHA here.
4. State exactly what was tested. Do not broaden a claim beyond the tested path.
5. Keep research/control branches distinct from production behavior.
6. Environmental failures do not invalidate a behavioral checkpoint unless they expose an actual source/build integration defect.
7. The repository has historically used branches, not Git tags, for these checkpoints.

## Next checkpoint to create

The next checkpoint should only be created after the RN 0.86 clean remote CI/EAS gate passes from a machine with no prior repository state.

It should record, at minimum, successful package install, config-plugin application, `prebuild --clean`, RN source build, Android compile/package, install/start, TopAppBar runtime, FloatingToolbar runtime, and NON_TOUCH runtime behavior.
