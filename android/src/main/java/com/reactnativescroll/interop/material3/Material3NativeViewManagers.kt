package com.reactnativescroll.interop.material3

/**
 * Material3 view-manager composition aliases.
 *
 * The native component ABI is React Native (`RNSIMaterialTopAppBar` / `RNSIMaterialToolbar`). The
 * underlying Compose host implementation retains its historical private Kotlin package for this
 * alpha, but it is no longer visible to the generic RN boundary or JavaScript surface.
 */
internal typealias MaterialTopAppBarManager = expo.modules.materialtoolbar.MaterialTopAppBarManager
internal typealias MaterialToolbarManager = expo.modules.materialtoolbar.MaterialToolbarManager
