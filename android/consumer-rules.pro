# The bare React Native binding is discovered reflectively by autolinking, and the Expo binding by
# expo-modules-autolinking. Neither is referenced from Kotlin, so keep both entry points.
-keep class com.materialtoolbar.rn.MaterialToolbarPackage { *; }
-keep class expo.modules.materialtoolbar.** { *; }
