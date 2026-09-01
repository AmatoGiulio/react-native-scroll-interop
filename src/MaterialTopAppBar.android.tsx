import React, { useCallback } from 'react';
import {
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MaterialTopAppBarNativeView from './MaterialTopAppBarNativeView';
import type {
  MaterialTopAppBarProps,
  MaterialTopAppBarVariant,
} from './MaterialTopAppBar.types';

const TOP_APP_BAR_HEIGHT: Record<MaterialTopAppBarVariant, number> = {
  small: 64,
  medium: 112,
  large: 152,
};

type MaterialTopAppBarNativeProps = MaterialTopAppBarProps & {
  layoutStyle: StyleProp<ViewStyle>;
};

export function MaterialTopAppBar(props: MaterialTopAppBarProps) {
  const insets = useSafeAreaInsets();
  const variant = props.variant ?? 'medium';
  const placement = props.placement ?? 'overlay';
  const height = insets.top + TOP_APP_BAR_HEIGHT[variant];

  return (
    <MaterialTopAppBarNative
      {...props}
      layoutStyle={[
        placement === 'header' ? styles.header : styles.topOverlay,
        { height },
      ]}
    />
  );
}

function MaterialTopAppBarNative({
  title,
  visible = true,
  variant = 'medium',
  scrollBehavior = 'none',
  navigationIcon = 'none',
  navigationAccessibilityLabel = 'Back',
  onNavigationPress,
  placement: _placement,
  themeMode = 'system',
  dynamicColor = true,
  style,
  layoutStyle,
}: MaterialTopAppBarNativeProps) {
  const handleNavigationPress = useCallback(() => {
    onNavigationPress?.();
  }, [onNavigationPress]);

  return (
    <MaterialTopAppBarNativeView
      style={[layoutStyle, style]}
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
  header: {
    position: 'relative',
    alignSelf: 'stretch',
  },
});
