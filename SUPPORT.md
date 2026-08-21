# Support

`react-native-scroll-interop` is currently an Android-first public alpha.

Before opening an issue, reproduce on a supported version from the compatibility matrix in `README.md` when possible.

For native-scroll behavior reports, include:

- `react-native-scroll-interop` version;
- React Native version;
- Expo SDK version if applicable;
- `react-native-screens` version if applicable;
- Android API level;
- device/emulator and ABI;
- whether the failure occurs during touch, fling, reverse fling, nested-scroll handoff, navigation source replacement, or terminal settle;
- a deterministic reproduction sequence or minimal repository when possible;
- relevant native logs if the issue involves transaction lifecycle or Material settle.

Reports that depend on visual motion should also confirm the device animation scales are enabled. Instrumentation frameworks may temporarily disable Android animator/transition/window animation scales, which can make a valid native settle appear instantaneous.

Compatibility requests should include a clean consumer build result. Broad version claims are added only after a fresh package/build/runtime gate has passed.
