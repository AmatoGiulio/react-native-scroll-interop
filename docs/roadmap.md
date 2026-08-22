# Roadmap

`react-native-scroll-interop` is not a general animation framework or a second scrolling system. Its job is to expose React Native's real Android nested-scroll transaction to native consumers while preserving React Native source physics.

## Current alpha

- publish `react-native-scroll-interop@0.1.0-alpha.1` under `next`;
- keep the npm tarball limited to runtime/public integration files;
- preserve explicit architecture, transaction, compatibility, and package-surface checks;
- document only compatibility that has been verified.

## Non-negotiable runtime invariants

```text
one React Native scroll physics
one synchronous Android nested-scroll transaction
N native consumers
```

React Native remains the touch/position/fling owner; consumers receive real Android nested-scroll callbacks; signed PRE/POST consumption stays conserved; TOUCH and NON_TOUCH remain independent; terminal Material behavior never starts a second source fling; navigation adapters never become transport layers.

## Next

### react-native-screens upstream seam

Prefer an optional AndroidX nested-scroll delegate owned by `react-native-screens`, with screens behavior first and external delegates receiving only the remaining signed distance. No Material3, Expo, or package dependency belongs upstream.

When a released screens version contains that seam, adopt it and retire source patching from the preferred path.

### Stable React Native 0.87 certification

Repeat the fresh package/install/build/runtime gate on stable RN 0.87 before expanding the support claim.

### Reproducible Android regression matrix

Keep a small matrix focused on distinct risks: touch collapse/expand, fling/reverse fling, TOUCH/NON_TOUCH overlap, reverse-direction consumption, nested ancestor priority, navigation source restoration, Material terminal settle, and animation-scale sanity.

### Motion regression evidence

Add repeatable observation of settle start/end fraction, duration, and Material state traces without replacing the native Material animation with test-owned motion.

### Native consumer extension contract

Only expose a supported extension API when it is small enough to preserve deterministic ordering, signed conservation, consumer neutrality, and single ownership of source motion.

## Later

- evaluate RN 0.88 from verified source/runtime evidence;
- expand released `react-native-screens` compatibility around the upstream seam;
- explore additional native consumers that genuinely benefit from the same synchronous transaction;
- move from `next` to `latest` only after stable RN certification, reproducible regression coverage, a settled navigation ownership path, and real external usage.

## Non-goals

- JavaScript-driven scroll synchronization;
- replacement React Native scroll physics;
- a parent-owned secondary fling/scroller;
- arbitrary parent `scrollBy` / `scrollTo` control;
- a navigation framework;
- Android behavior emulation on iOS/web;
- Material3 knowledge inside the neutral transaction core.
