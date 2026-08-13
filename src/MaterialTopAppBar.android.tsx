import React from 'react';
import { StyleSheet, View } from 'react-native';

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
    <View
      collapsable={false}
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFillObject, style]}
    >
      <ExpoMaterialTopAppBarNativeView
        style={styles.nativeHost}
        pointerEvents="box-none"
        title={title}
        visible={visible}
        variant={variant}
        scrollBehavior={scrollBehavior}
        themeMode={themeMode}
        dynamicColor={dynamicColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  nativeHost: { flex: 1 },
});
