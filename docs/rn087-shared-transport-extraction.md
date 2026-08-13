# RN 0.87 shared transport extraction

This hardening step moves source-scoped nested-scroll lifecycle ownership out of Expo-specific code.

## Contract

- The Android nested-scroll callback target is transaction authority.
- Momentum belongs to the concrete source that emitted `TYPE_NON_TOUCH`.
- A replacement source cannot inherit momentum from a destroyed source.
- Tree discovery may invalidate a removed source but cannot grant transaction authority to the new one.
- Stale stop callbacks must be rejected before `NestedScrollingParentHelper` is mutated.
- The shared kernel owns no fling physics, velocities, sampled `scrollY`, timers, or Material animation state.

## Validation order

1. Compile and visually validate the shared kernel in `rn087-bare-probe`.
2. Keep ordinary TopAppBar + FloatingToolbar behavior identical to the frozen multi-consumer baseline.
3. Exercise remount at rest, collapsed, and during `TYPE_NON_TOUCH` momentum.
4. Only after the bare host passes, wire the same kernel into `ExpoNestedScrollHostView`.

Expo SDK 57 is not used to certify RN 0.87. The bare RN 0.87 host is the certification runtime for this step.
