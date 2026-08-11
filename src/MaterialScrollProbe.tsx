import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';
import type { PropsWithChildren } from 'react';
import type { ViewProps } from 'react-native';

type MaterialScrollProbeProps = PropsWithChildren<ViewProps>;

const NativeMaterialScrollProbe = requireNativeViewManager<MaterialScrollProbeProps>(
  'ExpoMaterialTopAppBar',
  'ExpoNestedScrollHostView',
);

/**
 * Alpha.33 diagnostic transaction host.
 *
 * This temporary wrapper is the real Android nested-scroll ancestor of the RN ScrollView / FlashList.
 * Alpha.33 uses it to drive a complete native pre/child/post transaction for touch and fling.
 */
export function MaterialScrollProbe(props: MaterialScrollProbeProps) {
  return <NativeMaterialScrollProbe {...props} />;
}
