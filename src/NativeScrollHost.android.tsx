import * as React from 'react';
import type { PropsWithChildren } from 'react';
import {
  requireNativeComponent,
  type ViewProps,
} from 'react-native';

export type NativeScrollHostProps = PropsWithChildren<ViewProps>;

const NativeScrollHostView = requireNativeComponent<NativeScrollHostProps>(
  'RNSINestedScrollHost'
);

/**
 * Android native ancestor that exposes the real nested-scroll transaction to native consumers.
 *
 * React Native remains the owner of touch handling, child movement and fling physics. The host does
 * not install a JS onScroll handler and does not own a second scroller.
 */
export function NativeScrollHost(props: NativeScrollHostProps) {
  return <NativeScrollHostView {...props} />;
}
