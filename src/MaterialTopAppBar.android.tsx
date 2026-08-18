import React, { useCallback } from 'react';
import { StyleSheet } from 'react-native';

import ExpoMaterialTopAppBarNativeView from './ExpoMaterialTopAppBarNativeView';
import type { MaterialTopAppBarProps } from './MaterialTopAppBar.types';

export function MaterialTopAppBar({
  title,
  visible = true,
  variant = 'medium',
  scrollBehavior = 'none',
  navigationIcon = 'none',
  navigationAccessibilityLabel = 'Back',
  onNavigationPress,
  themeMode = 'system',
  dynamicColor = false,
  style,
}: MaterialTopAppBarProps) {
  const handleNavigationPress = useCallback(() => {
    onNavigationPress?.();
  }, [onNavigationPress]);

  return (
    <ExpoMaterialTopAppBarNativeView
      style={[styles.topOverlay, style]}
      pointerEvents="box-none"
      title={title}
      visible={visible}
      variant={variant}
      scrollBehavior={scrollBehavior}
      navigationIcon={navigationIcon}
      navigationAccessibilityLabel={navigationAccessibilityLabel}
      themeMode={themeMode}
      dynamicColor={dynamicColor}
      onNavigationPress={onNavigationPress ? handleNavigationPress : undefined}
    />
  );
}

const styles = StyleSheet.create({
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
