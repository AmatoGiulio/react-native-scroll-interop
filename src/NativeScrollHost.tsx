import * as React from 'react';
import type { PropsWithChildren } from 'react';
import { View, type ViewProps } from 'react-native';

export type NativeScrollHostProps = PropsWithChildren<ViewProps>;

/**
 * Non-Android fallback.
 *
 * Native scroll interoperability is Android-only. On other platforms this component preserves the
 * normal React Native layout/container behavior and does not attempt to load an unavailable native
 * view manager.
 */
export function NativeScrollHost(props: NativeScrollHostProps) {
  return <View {...props} />;
}
