# RN 0.87 production-readiness plan

Status date: 2026-08-13

## Product invariant

The production architecture must preserve one rule above all others:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N chrome consumers
```

React Native remains the sole owner of gesture recognition, fling velocity, `OverScroller` state and content position. Native ancestors may consume or observe the Android nested-scroll transaction, but must never create a second scroll, call `scrollBy`/`scrollTo` on the source to emulate Material behavior, or reconstruct momentum from sampled `scrollY`.

This invariant now has a repository gate:

```bash
npm run check:scroll-invariants
```

The gate scans the production host/consumer transport and fails if it reintroduces a parent-owned scroller, child `scrollBy`/`scrollTo`, a parent-started nested session, or timer-based motion reconstruction.

## Proven gates

### Source semantics — PASS for the ordinary non-paging path

RN 0.87 with `useNestedScrollViewAndroid=true` selects `ReactNestedScrollView`. Stock 0.87 loses the NON_TOUCH fling transaction because the generated override bypasses AndroidX's animated nested-scroll setup. The bare probe has repeatedly shown that restoring the source-owned NON_TOUCH transaction makes ordinary momentum visible to Parent3 while React Native remains the source of motion.

The production/upstream form of this fix is still gated on the remaining behavior matrix below. Do not infer that a probe implementation using private AndroidX bookkeeping or a custom source loop is the final patch shape.

### TopAppBar end to end — PASS

The bare RN 0.87 probe drives a real Material3 `LargeTopAppBar` / `exitUntilCollapsedScrollBehavior` from the same Parent3 transaction. The ledger explicitly accounts for normal post-complete frames and valid full-pre frames where AndroidX has no remaining motion to post-dispatch.

### Multi-consumer transaction — PASS

A real Material3 FloatingToolbar observes the same transaction as the consuming TopAppBar. It receives only real non-zero `childConsumedY` post frames and never modifies the Parent3 consumed array.

A representative ordinary multi-consumer run produced:

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

Every FloatingToolbar input frame matched a real non-zero child-consumed post frame: 261/261 TOUCH and 314/314 NON_TOUCH. Adding the second consumer did not change TopAppBar accounting.

This closes the architecture research gate: one RN-owned source transaction can drive multiple native Material consumers with different roles without introducing a second parent-owned scroll model.

## Behavior-regression gates

### Direct `snapToInterval` — clean product-shape gate PASS; stress gate next

The original V3/V4/V5 snap probes were rejected because the patched build visibly changed snap dynamics even when the nested transaction itself balanced. Those runs remain useful negative evidence: a green callback ledger is not sufficient if the source physics feels different from stock RN.

The current V6 product-shape direct-snap probe tests the source together with both real Material consumers and separates RN's visible child target from internal edge overfling bookkeeping. The validated 2026-08-13 run produced:

```text
Nested sessions
starts TOUCH / NON_TOUCH     21 / 16
stops  TOUCH / NON_TOUCH     21 / 16

Material3 TopAppBar
movement TOUCH / NON_TOUCH  131 / 8
settle start / end           25 / 25
settle completed/cancelled   25 / 0

Transaction ledger
post-complete frames        506
full-pre TOUCH frames        78
full-pre NON_TOUCH frames     0
complete frames             584
broken complete frames        0
unexpected orphan pre         0

Material3 FloatingToolbar
child movement post T/NT   235 / 219
observed posts T/NT        235 / 219
visual movement T/NT       128 / 63
settle start / end          25 / 25

Direct snap
direct-scroller requests     31
direct no-op skips           15
target-lock segments         16
target-lock frames          219
broken source frames          0
orphan frames / ends        0 / 0
overlapping starts            0
child target delta          16 / 16
scroller delta              14 / 14 applicable
final target                16 / 16
finished overfling tails      2
```

All direct-snap analyzer gates pass:

```text
bootstrap                  PASS
source class               PASS
NON_TOUCH session balance  PASS
NON_TOUCH frame dispatch   PASS
target-lock pre bypass     PASS
direct chrome path         PASS
snap target accounting     PASS
```

The two `finished overfling tails` are internal `OverScroller.currY` values past the top edge after the visible child has already reached target `0`. They are retained as diagnostics rather than rewritten or hidden. The source child reached the RN-selected target in 16/16 segments and the corresponding scroller had already been forced finished.

RN's own post-touch runnable intentionally issues a later `flingAndSnap(0)` pass for paging/snap stabilization. When that pass is a true no-op (`target == scrollY`, zero velocity), the probe does not open a second NON_TOUCH Material transaction. In the validated run 15 such no-op requests were skipped.

The same V6 device build was subsequently reported to have returned to normal snap feel after the earlier V3/V4/V5 regressions. Therefore the **clean direct-snap transaction, target and perceptual gate is PASS** for the tested gesture set. This is not yet a release-wide behavior PASS: interruption, immediate reversal and both content edges must still pass under deliberate stress.

The dedicated stress harness is:

```bash
npm run android:on-source-multi-chrome-snap-stress
npm run analyze:on-source-multi-chrome-snap-stress
```

It keeps the same `pagingEnabled + snapToInterval=184` physics, shortens only the test content so both edges are reachable, and adds diagnostics for `ACTION_DOWN` while a direct snap is still active. The stress analyzer treats an interrupted snap correctly: it does not require arrival at the abandoned target, but it does require zero old-snap frames after the new touch, balanced sessions, a real opposite-direction restart, exact targets for completed segments, and top/bottom edge coverage.

The current direct-snap source wrapper is still a probe implementation, not an upstream-final patch. It deliberately owns the transaction boundary around RN's existing snap `OverScroller`; its source-loop/edge behavior must not be promoted until the remaining regression matrix and upstream shape are resolved.

### Basic `pagingEnabled` — transaction/target PASS and stock behavioral parity PASS

Basic paging is a different RN animation path. With no explicit snap interval/offset/alignment, RN uses `smoothScrollAndSnap()` and its `ValueAnimator`-based `reactSmoothScrollTo()` path rather than the direct constrained `OverScroller` path above.

The validated multi-chrome paging run produced:

```text
Nested sessions
starts TOUCH / NON_TOUCH     13 / 8
stops  TOUCH / NON_TOUCH     13 / 8

Transaction ledger
post-complete frames        187
full-pre TOUCH frames        38
complete frames             225
broken complete frames        0
unexpected orphan pre         0

FloatingToolbar
child movement post T/NT    42 / 120
observed posts T/NT         42 / 120
visual movement T/NT        24 / 44

Paging animator
requests                      8
starts / ends               8 / 8
animator target matches     8 / 8
```

All paging transaction and final-target gates pass. The page-size snap can feel aggressive because `pagingEnabled` without an explicit snap interval uses RN's page-sized paging semantics. A three-way source-only comparison using the same JS props found the same undesirable feel in legacy `ReactScrollView`, stock `ReactNestedScrollView`, and the patched nested source. Therefore that feel is **stock behavioral parity**, not a regression introduced by the source transaction patch.

Do not reinterpret this result as a recommendation to use `pagingEnabled` for ordinary scrolling. The compatibility requirement is that the patch preserve RN's behavior, and that requirement is satisfied for the tested clean paging path.

## Required before calling the RN source patch production-safe

Explicitly validate:

- direct `snapToInterval` top and bottom edge behavior, including internal overfling tails;
- interrupting a running direct snap with a new touch;
- immediate direction reversal after interruption;
- short and high-velocity direct snaps;
- `snapToOffsets`;
- `disableIntervalMomentum`;
- deceleration-rate behavior;
- momentum begin/end event timing and count;
- scroll perf/FPS hooks;
- accessibility/programmatic scroll paths;
- recycled/Fabric ScrollView instances.

The canonical upstream change must be expressed in the nested-view generator plus regenerated output, because `ReactNestedScrollView.kt` is generated.

## Module hardening

The module-side transport already implements the intended compatibility boundary:

- store supported RN vertical sources as `ViewGroup`, not concrete `ReactScrollView`;
- accept both `ReactScrollView` and Kotlin-internal `ReactNestedScrollView` by runtime class identity;
- treat the actual Android nested callback target as transaction authority;
- use reflection only for the unstable RN scroll-away geometry primitive;
- keep TopAppBar as a pre/post consumer and FloatingToolbar as a child-consumed post observer;
- keep tracing gated behind `BuildConfig.DEBUG`;
- statically reject the main forms of second-scroll regression with `check:scroll-invariants`.

Still required:

- validate host/source lifecycle under Fabric remounts and view recycling;
- validate multiple screens and multiple ScrollViews, failing closed when source binding is ambiguous;
- validate nested navigators/screens and source changes during transitions;
- validate RTL, font scaling, display density changes and configuration recreation;
- verify a release build with tracing disabled;
- verify no JS/userland bridge work occurs per frame under profiler/device tracing.

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

## Automated gates

Before release, CI/device tests should cover at least:

1. source class OFF/ON gate;
2. balanced TOUCH and NON_TOUCH start/stop;
3. source-patch runtime gate when the patch is required;
4. TopAppBar TOUCH/NON_TOUCH movement;
5. complete transaction conservation ledger;
6. FloatingToolbar 100% coverage of non-zero child-consumed post frames;
7. Material settle completion for both consumers;
8. edge/interruption/snap/paging regression scenarios, including behavioral comparison against stock RN;
9. `npm run check:scroll-invariants`;
10. release build smoke test with tracing disabled.

Items 1–7 have concrete passing product-shape gates for ordinary scroll, clean direct snap and clean basic paging where applicable. Basic paging now has transaction/target PASS plus legacy/stock/patched behavioral parity. Item 8 remains the primary RN source-patch blocker, with direct-snap interruption/reversal/edge stress now the immediate scenario. Item 9 is implemented and must be executed in release validation; item 10 remains a packaging/runtime-cost blocker.

## Public/upstream path

The public story and upstream proposal should separate these claims:

1. RN 0.87 already contains the AndroidX nested-scroll machinery.
2. The generated RN animated paths do not all enter that machinery consistently.
3. Once the source exposes the transaction, multiple native Material consumers can share it without reconstructing a parent-owned second scroll.
4. Target-locked snap/paging paths need their own behavioral contract; a transaction-conservation PASS alone does not prove physics equivalence.

Do not present any probe source wrapper as upstream-final until the full RN behavior-regression matrix is green and the generator-level solution is defined.

## Definition of production ready

This project is production ready when:

- the RN source fix is either upstreamed or maintained as a versioned, reproducible patch with a complete behavior regression suite;
- the package installs on an officially compatible host stack without Gradle/Kotlin shims;
- TopAppBar and FloatingToolbar pass the same real-transaction gates on device;
- lifecycle/navigation/multiple-source scenarios fail safely;
- debug instrumentation is optional and zero-cost enough in release;
- compatibility and installation requirements are documented publicly;
- the invariant remains true in code review and CI: RN owns the only scroll physics.
