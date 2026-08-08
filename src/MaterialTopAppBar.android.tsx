import React from 'react';
import { StyleSheet } from 'react-native';

import ExpoMaterialTopAppBarNativeView from './ExpoMaterialTopAppBarNativeView';
import type { MaterialTopAppBarProps } from './MaterialTopAppBar.types';

export function MaterialTopAppBar({
  title,
  visible = true,
  variant = 'medium',
  scrollBehavior = 'none',
  themeMode = 'system',
  dynamicColor = false,
  style,
}: MaterialTopAppBarProps) {
  return (
    <ExpoMaterialTopAppBarNativeView
      style={[StyleSheet.absoluteFillObject, style]}
      pointerEvents="box-none"
      title={title}
      visible={visible}
      variant={variant}
      scrollBehavior={scrollBehavior}
      themeMode={themeMode}
      dynamicColor={dynamicColor}
    />
  );
}
