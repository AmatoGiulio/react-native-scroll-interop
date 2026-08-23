# Changelog

All notable public changes to `react-native-scroll-interop` will be recorded here.

The project follows semantic versioning once releases are published. Pre-1.0 alpha releases may still refine native integration contracts while preserving the documented transaction invariants.

## Unreleased

### Documentation

- hardened the public README around the actual runtime architecture and supported matrix;
- replaced stale pre-merge release notes with the final PR #26 certification record;
- added a roadmap covering upstream `react-native-screens` ownership, stable RN compatibility, regression evidence, and release maturity.

## 0.1.0-alpha.1

Initial public alpha candidate.

### Core

- neutral Android nested-scroll transaction core with source-scoped lifecycle and signed conservation;
- generic React Native boundary that preserves React Native touch/fling ownership;
- standard React Native package/autolinking support;
- standalone `NativeScrollHost` ownership path;
- version-scoped React Native 0.86/0.87 compatibility adapters.

### Reference native participants (Material3)

- native Material3 TopAppBar PRE/POST consumer;
- complete TopAppBar scroll-behavior mapping for `pinned`, `enterAlways`, and
  `exitUntilCollapsed`, with a separate fixed `none` mode;
- New Architecture-safe native direct events through React Native's `EventDispatcher`;
- native Material3 FloatingToolbar POST observer;
- terminal Material settle driven by Material state rather than a second source fling;
- standard native React Native view managers with no Expo Modules runtime dependency.

### Navigation

- Expo Router adapter;
- React Navigation native-stack adapter;
- shared internal navigator-neutral mapping/header renderer;
- validated `react-native-screens 4.26.x` navigation-first adapter;
- documented upstream-neutral `react-native-screens` seam.

### Validation

- architecture-boundary checks;
- scroll/Material3 invariant checks;
- navigation mapping checks;
- RN compatibility transformation checks;
- package-surface checks;
- fresh Expo SDK 57 / RN 0.86 Android build/runtime certification;
- fresh bare RN 0.87.0-rc.3 Android build/install/Hermes runtime certification.
