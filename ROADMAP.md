# Roadmap

This roadmap is intentionally narrow. `react-native-scroll-interop` is not trying to become a general animation framework or a second scrolling system. The core goal is to expose React Native's real Android nested-scroll transaction to native consumers while preserving React Native source physics.

## Current alpha

### Public package

- publish `react-native-scroll-interop@0.1.0-alpha.1` under the npm `next` dist-tag;
- keep the npm tarball limited to runtime/public integration files;
- maintain explicit package-surface and architecture-boundary checks;
- document the supported compatibility matrix without over-claiming untested versions.

### Runtime invariants

Keep these non-negotiable across releases:

```text
one React Native scroll physics
one synchronous Android nested-scroll transaction
N native consumers
```

Specifically:

- React Native remains the owner of touch handling, source position, and fling physics;
- consumers receive real Android nested-scroll callbacks, not sampled JavaScript positions;
- signed PRE/POST consumption remains conserved and clamped;
- TOUCH and NON_TOUCH lifecycle remains independent;
- terminal Material behavior never starts a second source fling;
- navigation adapters never become scroll-transport layers.

## Next

### 1. react-native-screens upstream seam

Move navigation-first ownership away from a package-specific source patch when upstream support is available.

Target shape:

- optional AndroidX nested-scroll delegate at the screen coordinator level;
- screens-owned behavior always receives priority;
- external delegates receive only the remaining signed distance;
- no Material3, Expo, or `react-native-scroll-interop` dependency in `react-native-screens`;
- stock screens behavior remains unchanged when no delegate is installed.

Once an upstream release contains the seam:

- add an adapter for that released screens version;
- retain the existing 4.26.x path only while it is useful and supportable;
- remove source patching from the preferred installation path.

### 2. Stable React Native 0.87 certification

The current 0.87 runtime gate was completed on `react-native@0.87.0-rc.3`.

Before expanding the stable support claim:

- repeat fresh tarball installation against stable RN 0.87;
- run the bare compatibility adapter from a clean RN source tree;
- compile, assemble, install, and launch Hermes runtime;
- validate touch, fling, reverse fling, terminal settle, and source ownership;
- update the peer/support matrix only from verified evidence.

### 3. Reproducible Android regression matrix

Formalize a small but meaningful device/API matrix around the behaviors most likely to regress:

- touch collapse/expand;
- ordinary fling and reverse fling;
- TOUCH/NON_TOUCH overlap;
- signed reverse-direction consumption;
- nested ancestor priority;
- navigation source replacement/restoration;
- Material terminal settle;
- animation-scale/environment sanity checks for motion validation.

The goal is not a large matrix for its own sake. Each environment should cover a distinct compatibility or behavior risk.

### 4. Motion regression evidence

Add a repeatable way to detect changes in terminal Material motion without replacing native motion with test-owned animation logic.

Useful evidence may include:

- settle start/end fraction;
- settle duration;
- frame/offset trace from the Material state;
- explicit control of Android animation scales during visual validation.

This remains an observation/regression tool. The package should continue to delegate motion to the native Material behavior.

### 5. Native consumer extension contract

The internal architecture already separates the neutral transaction engine from Material3.

A future release should decide whether and how to document a supported extension contract for additional native consumers while preserving:

- consumer neutrality in the core;
- deterministic ordering;
- signed conservation;
- no ownership of source motion;
- no navigation-library knowledge in the transaction engine.

Do not expose this as public API until the contract is small enough to support long term.

## Later

### React Native compatibility expansion

- evaluate RN 0.88 when its Android scroll implementation is stable enough to inspect;
- prefer capability/contract compatibility over broad version claims;
- keep version-scoped source transformations fail-closed when they are still necessary.

### react-native-screens compatibility expansion

- track released Stack v5 ownership changes;
- prefer the upstream neutral seam once available;
- avoid carrying multiple invasive screen patches across unrelated versions.

### Additional native consumers

Explore consumers that benefit from the same transaction without changing source physics. Any new consumer must sit above the neutral core in the same way Material3 does today.

Potential work should be accepted only when it demonstrates a real native behavior that cannot be represented faithfully by per-frame JavaScript observation alone.

### Release maturity

Move from `next` toward `latest` only when:

- supported React Native lines are stable releases with fresh consumer certification;
- the preferred navigation ownership path no longer depends on a brittle package-specific screen patch;
- the regression matrix is reproducible;
- migration expectations are documented;
- package API/support boundaries have survived real external use.

## Non-goals

The project should not evolve toward:

- a JavaScript-driven scroll synchronization layer;
- a replacement for React Native scroll physics;
- a parent-owned secondary fling/scroller;
- arbitrary `scrollBy` / `scrollTo` control of the source;
- a navigation framework;
- Android behavior emulation on iOS/web;
- Material3 knowledge inside the neutral transaction core.

Those constraints are part of the product, not temporary implementation details.
