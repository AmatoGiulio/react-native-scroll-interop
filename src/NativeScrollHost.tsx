import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';
import type { PropsWithChildren } from 'react';
import type { ViewProps } from 'react-native';

type NativeScrollHostProps = PropsWithChildren<ViewProps>;

const NativeScrollHostView = requireNativeViewManager<NativeScrollHostProps>(
  'ExpoMaterialTopAppBar',
  'ExpoNestedScrollHostView',
);

/**
 * Makes the scrolling view inside it reachable by native chrome.
 *
 * Android drives scroll-reactive chrome through nested scrolling, and a ReactScrollView emits those
 * callbacks to its native ancestors — of which the React Native tree has none that listen. This
 * component is that ancestor. Wrap it around a list and a native TopAppBar or FloatingToolbar on
 * the same screen follows the scroll, with no onScroll handler, no ref and no work on the JS
 * thread.
 *
 * Nothing here is specific to Material: the host is a plain nested-scrolling parent, and Material
 * is simply what currently consumes it. The intended home for this is the screen/navigation layer,
 * which already wraps screen content in a view group of its own — see
 * docs/rfc-native-scroll-transport.md.
 */
export function NativeScrollHost(props: NativeScrollHostProps) {
  return <NativeScrollHostView {...props} />;
}
