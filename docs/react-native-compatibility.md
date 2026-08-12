# React Native / Expo compatibility

Status date: 2026-08-12

This file separates **validated scroll semantics** from **host-stack support**. A React Native version is not production-supported merely because the Kotlin sources compile against it.

## Current matrix

| Host | RN vertical source | Momentum transaction | Material multi-consumer | Status |
| --- | --- | --- | --- | --- |
| Expo SDK 55 / RN 0.83 | `ReactScrollView` | Requires the maintained RN 0.83 source patch | Validated TopAppBar + FloatingToolbar baseline | Validated legacy baseline |
| Expo SDK 56 / RN 0.85 | not characterized on this branch | not characterized | not characterized | Unsupported until tested |
| Expo SDK 57 / RN 0.86 | not characterized on this branch | not characterized | not characterized | Unsupported until tested |
| Bare RN 0.87.0 | `ReactNestedScrollView` with flag enabled | Requires the RN 0.87 nested-fling fix | Validated: 706 complete frames, 0 broken, exact FloatingToolbar coverage | Production-hardening target |
| Expo stable + RN 0.87.0 | no stable Expo SDK targets RN 0.87 on the status date | n/a | n/a | Do not claim stable support |

Expo's current stable SDK reference maps SDK 57 to React Native 0.86. Expo also documents that pre-release/canary SDK packages are not considered stable. Therefore the RN 0.87 work is validated first on the bare RN host and must not be advertised as stable Expo support yet.

## RN 0.87.0 requirements

RN 0.87.0 ships `ReactNestedScrollView`, but `useNestedScrollViewAndroid` defaults to false and the generated ordinary fling path bypasses AndroidX's NON_TOUCH setup.

A working 0.87.0 host therefore needs all of the following:

1. enable `useNestedScrollViewAndroid` before the ScrollView manager is materialized;
2. apply the version-locked nested-fling source fix;
3. compile `react-android` from that patched npm source, or consume an equivalent patched ReactAndroid artifact;
4. use the actual nested-scroll callback target as transaction authority;
5. keep RN as the only owner of scroll physics.

The repository provides:

```bash
npm run patch:rn087-nested-fling
npm run check:rn087-nested-fling
npm run check:scroll-invariants
```

`with-rn087-nested-scroll.js` is an explicit Expo-config compatibility plugin for RN **0.87.0 only**. It:

- fails on any other RN version;
- adds Gradle composite-build dependency substitution so `react-android` is compiled from `node_modules/react-native` rather than the Maven AAR;
- opts into `useNestedScrollViewAndroid` immediately after RN's normal bootstrap;
- delegates every other feature flag to RN's Stable Android provider;
- aborts if `useNestedScrollViewAndroid` had already been accessed.

The plugin does **not** silently modify React Native source. The source patch remains an explicit installation/build step.

## Why the feature-flag opt-in is narrow

RN's normal new-architecture entry point installs its Stable feature-flag provider with `ReactNativeFeatureFlags.override(...)`. RN permits ordinary override only once, so an app cannot install another provider before/after normal bootstrap using the safe API.

RN also exposes `dangerouslyForceOverride`, which can replace the accessor but warns about inconsistent values for flags that were already read. Our 0.87 compatibility path limits that risk by delegating all flags to the exact Stable provider and changing one flag only. Startup fails if that changed flag was already accessed.

This is a temporary version-specific compatibility mechanism, not the desired long-term API. Remove it when React Native exposes a supported opt-in/default for the nested ScrollView implementation.

## Release policy

A new RN version moves from unsupported to supported only after these gates are green on device:

- native source class is the expected implementation;
- TOUCH and NON_TOUCH sessions are balanced;
- source-owned momentum reaches the Parent3 ancestor frame by frame;
- TopAppBar ledger has zero broken and zero unexpected frames;
- FloatingToolbar observes 100% of non-zero child-consumed post frames;
- edge/interruption/paging/snap/deceleration/momentum-event regression suite passes;
- lifecycle/multiple-source/navigation scenarios fail safely;
- release build runs with per-frame tracing disabled;
- `check:scroll-invariants` passes.

Do not widen peer dependency claims ahead of this matrix.
