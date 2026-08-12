# RN 0.87 production-readiness plan

Status date: 2026-08-12

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

### Source semantics — PASS

RN 0.87 with `useNestedScrollViewAndroid=true` selects `ReactNestedScrollView`. Stock 0.87 loses the NON_TOUCH fling transaction because the generated override bypasses AndroidX's animated nested-scroll setup. Building ReactAndroid from source and priming AndroidX's TYPE_NON_TOUCH bookkeeping before reinstating RN's original `OverScroller` parameters restores frame-by-frame momentum dispatch without a parent shim.

### TopAppBar end to end — PASS

The bare RN 0.87 probe drives a real Material3 `LargeTopAppBar` / `exitUntilCollapsedScrollBehavior` from the same Parent3 transaction. The validated run accounted for 249 complete frames, zero broken frames and zero unexpected pre-only frames, including full-pre frames that AndroidX legitimately does not post-dispatch after all motion has already been consumed.

### Multi-consumer transaction — PASS

A real Material3 FloatingToolbar now observes the same transaction as the consuming TopAppBar. It receives only non-zero `childConsumedY` in post-scroll and never modifies the Parent3 consumed array.

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

## Behavior-regression gates

### Direct snap — transaction PASS, behavioral equivalence NOT YET PASS

The first RN 0.87 direct-snap run with the V3 source probe produced balanced nested sessions and complete NON_TOUCH frame dispatch:

```text
starts TOUCH / NON_TOUCH    16 / 28
stops  TOUCH / NON_TOUCH    16 / 28
pre    TOUCH / NON_TOUCH   180 / 156
post   TOUCH / NON_TOUCH   180 / 156
direct-scroller requests    28
direct nested primes        28
```

The structural analyzer passed, but the device test reported visibly jerky / unusual snap motion. Therefore this run is **not** evidence that snap behavior is production-safe. Visual behavior is part of the regression contract.

The current direct analyzer also proves request-to-prime wiring, not yet exact final-position equivalence. Do not summarize this result as "snap PASS".

A three-way A/B gate now compares the same `pagingEnabled + snapToInterval` JS configuration under:

```text
legacy   ReactScrollView, feature flag OFF, no source patch
stock    ReactNestedScrollView, feature flag ON, prebuilt RN 0.87, no source patch
patched  ReactNestedScrollView, feature flag ON, ReactAndroid from source + V3 patch
```

The next decision depends on that comparison:

- if legacy, stock and patched all feel the same, the observed snapping is RN's existing behavior and the patch must merely preserve it;
- if stock differs from legacy, the generated RN 0.87 nested source itself has a snap behavior regression;
- if patched differs from stock, the V3 patch is responsible and must be changed before proceeding.

Paging-animator validation remains blocked until this A/B result is understood.

## Required before calling the RN source patch production-safe

Explicitly validate:

- top and bottom edge behavior, including overfling/edge effects;
- interrupting a running fling with a new touch;
- immediate direction reversal;
- short and high-velocity flings;
- paging mode;
- snap interval and snap offsets;
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
8. edge/interruption/snap/paging regression scenarios, including behavioral A/B against stock RN;
9. `npm run check:scroll-invariants`;
10. release build smoke test with tracing disabled.

Items 1–7 and 9 have concrete validated implementations in this branch. Item 8 is now the primary RN source-patch blocker; item 10 is the primary packaging/runtime-cost blocker.

## Public/upstream path

The public story and upstream proposal should separate three claims:

1. RN 0.87 already contains the AndroidX nested-scroll machinery.
2. The generated RN fling override bypasses AndroidX's NON_TOUCH entry point.
3. Once the source enters the AndroidX path, multiple native Material consumers can share the real RN-owned transaction without reconstructing a second scroll.

Do not present the proof patch as upstream-final until the RN behavior-regression matrix above is green.

## Definition of production ready

This project is production ready when:

- the RN source fix is either upstreamed or maintained as a versioned, reproducible patch with a complete behavior regression suite;
- the package installs on an officially compatible host stack without Gradle/Kotlin shims;
- TopAppBar and FloatingToolbar pass the same real-transaction gates on device;
- lifecycle/navigation/multiple-source scenarios fail safely;
- debug instrumentation is optional and zero-cost enough in release;
- compatibility and installation requirements are documented publicly;
- the invariant remains true in code review and CI: RN owns the only scroll physics.
