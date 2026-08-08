# Expo SDK 55 compatibility

This package uses `androidx.compose.material3:material3:1.5.0-alpha17`.

The host app shown during integration uses Expo SDK 55, React Native 0.83.6, Android Gradle Plugin 8.12.0 and compileSdk 36. Material 3 `1.5.0-alpha23` still resolves Compose `1.12.0-alpha03` in that graph, and those AARs require API 37 / AGP 9.1+, so alpha23 is not suitable for this host.

Compose `1.12.0-alpha01` is the release where Compose moved its compileSdk to API 37. Material 3 `1.5.0-alpha17` predates that Compose release and still contains the Expressive FloatingToolbar API used by this module. In alpha17 the toolbar API is experimental, so the Android bridge opts in with `ExperimentalMaterial3ExpressiveApi`.

Do not change the host compileSdk or AGP just to satisfy this module. First verify this alpha17 package against the existing Expo 55 toolchain.

## Kotlin compile fix (alpha.4)

Compose `PaddingValues.calculateStartPadding` and `calculateEndPadding` are extension functions, so the bridge imports them explicitly. This fixes the unresolved references reported with the Compose version resolved by Expo SDK 55.


### alpha.6 touch host

The default React Native host still fills the screen, but the Android Compose child is
now wrap-content and the host is `box-none` for React Native hit-testing. This avoids
the full-screen native view swallowing touches on RN 0.83/Fabric while retaining
automatic Material placement and safe insets.
