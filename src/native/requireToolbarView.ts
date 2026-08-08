import type { ComponentType } from 'react';

/**
 * Resolve a native component from whichever binding the host app actually has.
 *
 * Expo apps register the views through expo-modules-autolinking under their Expo module names;
 * bare React Native apps register them through `MaterialToolbarPackage` under plain view-manager
 * names. Both drive the same Android host view, so the choice is invisible above this function.
 *
 * `expo-modules-core` is an optional peer dependency: the require is guarded so a bare app that
 * never installed Expo does not fail to bundle.
 */
export function requireToolbarView<P>(expoName: string, bareName: string): ComponentType<P> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeViewManager } = require('expo-modules-core');
    return requireNativeViewManager(expoName) as ComponentType<P>;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeComponent } = require('react-native');
    return requireNativeComponent(bareName) as ComponentType<P>;
  }
}
