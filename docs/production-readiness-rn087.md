# RN 0.87 production-readiness plan

Status date: 2026-08-16

## Product invariant

The production architecture must preserve one rule above all others:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N chrome consumers
```

React Native remains the sole owner of gesture recognition, fling velocity, `OverScroller` state and content position. Native ancestors may consume or observe the Android nested-scroll transaction, but must never create a second scroll, call `scrollBy`/`scrollTo` on the source to emulate Material behavior, or reconstruct momentum from sampled `scrollY`.

This invariant has a repository gate:

```bash
npm run check:scroll-invariants
```

The gate scans the production host/consumer transport and fails if it reintroduces a parent-owned scroller, child `scrollBy`/`scrollTo`, a parent-started nested session, or timer-based motion reconstruction.

## Proven architecture gates

### Source semantics — PASS

RN 0.87 with `useNestedScrollViewAndroid=true` selects `ReactNestedScrollView`. Stock 0.87 loses the NON_TOUCH fling transaction because the generated override bypasses `NestedScrollView.fling()`. Building ReactAndroid from source and delegating the ordinary fling path to AndroidX restores balanced TOUCH/NON_TOUCH sessions and frame-by-frame momentum dispatch without a parent shim.

### TopAppBar end to end — PASS

The bare RN 0.87 probe drives a real Material3 `LargeTopAppBar` / `exitUntilCollapsedScrollBehavior` from the same Parent3 transaction. The validated run accounted for 249 complete frames, zero broken frames and zero unexpected pre-only frames, including full-pre frames that AndroidX legitimately does not post-dispatch after all motion has already been consumed.

### Multi-consumer transaction — PASS

A real Material3 FloatingToolbar observes the same transaction as the consuming TopAppBar. It receives only non-zero `childConsumedY` in post-scroll and never modifies the Parent3 consumed array.

The validated run produced:

```text
Nested sessions
starts TOUCH / NON_TOUCH     68 / 34
stops  TOUCH / NON_TOUCH     68 / 34

Transaction ledger
post-complete frames        630
full-pre TOUCH frames        76
full-pre NON_TOUCH frames     0
complete frames             706
broken complete frames        0
unexpected orphan pre         0

FloatingToolbar
child movement post T/NT   261 / 314
observed posts T/NT        261 / 314
visual movement T/NT       109 / 2
settle start / end          42 / 42
```

Every FloatingToolbar input frame matched a real non-zero child-consumed post frame: 261/261 TOUCH and 314/314 NON_TOUCH. Adding the second consumer did not change TopAppBar accounting: 706 complete frames, zero broken and zero unexpected.

This closes the architecture research gate: one RN-owned source transaction can drive multiple native Material consumers with different roles without introducing a second scroll model.

## Upstream React Native source fix

The source-boundary fix is now proposed upstream as:

```text
react/react-native#57972
Android: preserve NestedScrollView fling nested-scroll lifecycle
head: c616f357d9ced1934111a66b574634c564682f90
```

Current status as of 2026-08-16:

- PR open;
- mergeable;
- not draft;
- one commit;
- two changed files: the nested-view generator and regenerated `ReactNestedScrollView.kt`;
- Meta CLA accepted;
- awaiting upstream CI/review.

The proposal keeps `ReactScrollView` unchanged. For the generated nested variant, paging/snap continues through `flingAndSnap()`, while ordinary non-paging flings delegate to `super.fling(correctedVelocityY)`. React Native still initiates and owns the fling; AndroidX supplies the real `TYPE_NON_TOUCH` nested-scroll lifecycle.

The generator also validates the copied scroller branch before replacing it and fails closed if the expected source shape changes.

During upstream review, do not expand the patch unless maintainer feedback or a demonstrated correctness issue requires it.

## Regression matrix: what PR #57972 now covers

The upstream test plan materially reduces the old source-patch uncertainty. The following scenarios have explicit stock-versus-patched evidence in the PR:

| Scenario | Current evidence |
| --- | --- |
| ordinary low-velocity fling | COVERED |
| ordinary high-velocity fling | COVERED |
| top-edge endpoint | COVERED |
| bottom-edge endpoint | COVERED |
| deceleration normal | COVERED |
| deceleration fast | COVERED |
| perf-tagged fling endpoint | COVERED |
| paging path | COVERED / unchanged |
| snap interval | COVERED / unchanged |
| snap offsets | COVERED / unchanged |
| `disableIntervalMomentum` | COVERED / unchanged |
| programmatic scroll | COVERED / unchanged |
| physical touch fling opens NON_TOUCH | COVERED |
| interrupt running fling with touch | COVERED |
| immediate deterministic reversal | COVERED |
| ordinary final-distance equivalence | COVERED, 0.00% delta in recorded cases |
| deceleration fast/normal ratio | COVERED, same recorded ratio |

These results support the narrow claim that ordinary nested flings can enter AndroidX without changing the tested RN motion endpoints, while specialized paging/snap paths remain on their existing branch.

## Source-fix validation still not closed by that matrix

Do not broaden the PR evidence beyond what was actually measured. The following remain distinct validation items before calling the source change fully production-safe across the complete React Native surface:

- detailed overfling/edge-effect behavior, beyond the recorded top/bottom endpoints;
- momentum begin/end event timing and exact event count;
- perf/FPS hook semantics beyond the recorded perf-tagged endpoint;
- accessibility-driven scroll behavior;
- recycled/Fabric ScrollView instance behavior under realistic remount/reuse;
- any maintainer-requested platform/regression scenario not represented by the current probe.

The old statement that paging/snap/deceleration/interruption/reversal were all still untested is therefore obsolete. They are covered by the current upstream PR test plan and must not remain listed as generic open blockers.

## Module hardening

The module-side transport already implements the intended compatibility boundary:

- store supported RN vertical sources as `ViewGroup`, not concrete `ReactScrollView`;
- accept both `ReactScrollView` and Kotlin-internal `ReactNestedScrollView` by runtime class identity;
- treat the actual Android nested callback target as transaction authority;
- use reflection only for the unstable RN scroll-away geometry primitive;
- keep TopAppBar as a pre/post consumer and FloatingToolbar as a child-consumed post observer;
- keep tracing gated behind `BuildConfig.DEBUG`;
- statically reject the main forms of second-scroll regression with `check:scroll-invariants`.

Still required for package-level production hardening:

- align the production diagnostic ledger with the validated AndroidX full-pre classification wherever any diagnostic path still differs;
- validate host/source lifecycle under Fabric remounts and view recycling;
- validate multiple screens and multiple ScrollViews, failing closed when source binding is ambiguous;
- validate nested navigators/screens and source changes during transitions;
- validate RTL, font scaling, display density changes and configuration recreation;
- verify a release build with tracing disabled;
- verify no JS/userland bridge work occurs per frame under profiler/device tracing.

These module/package gates are separate from the narrow React Native source fix and should not be pushed into PR #57972.

## Host and package strategy

Do not revive the Expo 57 + RN 0.87 compatibility experiment as the production host. It mixed source-semantic validation with unrelated Gradle/Kotlin/AGP incompatibilities.

Production integration should use a host stack that officially supports the target RN line. The compatibility matrix should state separately:

```text
React Native version
useNestedScrollViewAndroid availability/default
source patch requirement
Expo SDK / bare RN host compatibility
Material3 version
module version
```

If the RN feature remains disabled by default, the package must either document an early application-level opt-in or provide a narrowly scoped supported installation mechanism. It must not silently use `dangerouslyForceOverride` as a general production strategy.

The current repository package remains an internal alpha workspace (`private: true`). Publication boundaries and npm contents are a later release decision and should be validated with `npm pack` plus a fresh consumer rather than changed as repository cosmetics.

## Automated gates

Before release, CI/device tests should cover at least:

1. source class OFF/ON gate;
2. balanced TOUCH and NON_TOUCH start/stop;
3. source-fix runtime gate when the fix/patch is required;
4. TopAppBar TOUCH/NON_TOUCH movement;
5. complete transaction conservation ledger;
6. FloatingToolbar 100% coverage of non-zero child-consumed post frames;
7. Material settle completion for both consumers;
8. source regression scenarios represented by the upstream matrix plus the remaining targeted gaps above;
9. `npm run check:scroll-invariants`;
10. release build smoke test with tracing disabled.

Items 1–7 and 9 have concrete implementations/evidence in the repository line. Item 8 is now substantially covered by PR #57972 rather than being wholly open. Item 10 remains a package/runtime-cost gate.

## Public/upstream path

The public story separates three claims:

1. RN 0.87 already contains the AndroidX nested-scroll machinery.
2. The generated RN fling override bypasses AndroidX's NON_TOUCH entry point.
3. Once the source enters the AndroidX path, multiple native Material consumers can share the real RN-owned transaction without reconstructing a second scroll.

PR #57972 is the upstream proposal for claim 2. The module repository is evidence for claim 3; it is not a reason to make the RN source patch Material-specific.

## Definition of production ready

This project is production ready when:

- the RN source fix is upstreamed or maintained as a versioned, reproducible compatibility patch with sufficient regression coverage;
- the package installs on an officially compatible host stack without unbounded Gradle/Kotlin shims;
- TopAppBar and FloatingToolbar pass the same real-transaction gates on device;
- lifecycle/navigation/multiple-source scenarios fail safely;
- debug instrumentation is optional and sufficiently cheap/disabled in release;
- compatibility and installation requirements are documented publicly;
- the invariant remains true in code review and CI: RN owns the only scroll physics.
