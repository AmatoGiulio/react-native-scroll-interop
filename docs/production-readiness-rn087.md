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

## Proven gates

### Source semantics — PASS

RN 0.87 with `useNestedScrollViewAndroid=true` selects `ReactNestedScrollView`. Stock 0.87 loses the NON_TOUCH fling transaction because the generated override bypasses `NestedScrollView.fling()`. Building ReactAndroid from source and delegating the ordinary fling path to AndroidX restores balanced TOUCH/NON_TOUCH sessions and frame-by-frame momentum dispatch without a parent shim.

### TopAppBar end to end — PASS

The bare RN 0.87 probe drives a real Material3 `LargeTopAppBar` / `exitUntilCollapsedScrollBehavior` from the same Parent3 transaction. The validated run accounted for 249 complete frames, zero broken frames and zero unexpected pre-only frames, including full-pre frames that AndroidX legitimately does not post-dispatch after all motion has already been consumed.

### Multi-consumer transaction — IN PROGRESS

Add a real Material3 FloatingToolbar consumer to the same transaction. It must observe only non-zero `childConsumedY` in post-scroll, must not alter the Parent3 consumed array, must receive both TOUCH and NON_TOUCH movement, and must leave the TopAppBar ledger at zero broken/unexpected frames.

## Required before calling the RN source patch production-safe

The current proof patch changes the ordinary nested ScrollView fling to enter AndroidX's own `NestedScrollView.fling()` path. Before upstreaming or shipping it as a maintained patch, explicitly validate:

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

The module-side transport is already moving toward the correct compatibility boundary:

- store supported RN vertical sources as `ViewGroup`, not concrete `ReactScrollView`;
- accept both `ReactScrollView` and Kotlin-internal `ReactNestedScrollView` by runtime class identity;
- treat the actual Android nested callback target as transaction authority;
- use reflection only for the unstable RN scroll-away geometry primitive;
- keep TopAppBar as a pre/post consumer and FloatingToolbar as a child-consumed post observer.

Still required:

- update production diagnostics so fully pre-consumed TOUCH/NON_TOUCH frames are classified according to AndroidX's `No motion, no dispatch` rule rather than as ledger failures;
- validate host/source lifecycle under Fabric remounts and view recycling;
- validate multiple screens and multiple ScrollViews, failing closed when source binding is ambiguous;
- validate nested navigators/screens and source changes during transitions;
- validate RTL, font scaling, display density changes and configuration recreation;
- ensure release builds do not pay per-frame logging/debug costs;
- ensure no JS/userland bridge work occurs per frame.

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
8. edge/interruption/snap/paging regression scenarios;
9. no parent-owned scroller / no child scroll mutation invariant checks where practical;
10. release build smoke test with tracing disabled.

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
- the invariant remains true in code review: RN owns the only scroll physics.
