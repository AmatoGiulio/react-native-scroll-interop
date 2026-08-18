import type { StyleProp, ViewStyle } from 'react-native';

import type { MaterialToolbarThemeMode } from './MaterialToolbar.types';

export type MaterialTopAppBarVariant = 'small' | 'medium' | 'large';
export type MaterialTopAppBarScrollBehavior = 'none' | 'enterAlways' | 'exitUntilCollapsed';
export type MaterialTopAppBarNavigationIcon = 'none' | 'back';

/**
 * Native Android Material3 TopAppBar driven by the same real nested-scroll transaction as the
 * React Native scroll source.
 *
 * The component is navigation-library agnostic. When it is used as a custom navigator header,
 * pass the navigator's go-back callback through `onNavigationPress` and select the `back` icon.
 */
export type MaterialTopAppBarProps = {
  title: string;
  visible?: boolean;
  variant?: MaterialTopAppBarVariant;
  scrollBehavior?: MaterialTopAppBarScrollBehavior;
  navigationIcon?: MaterialTopAppBarNavigationIcon;
  navigationAccessibilityLabel?: string;
  onNavigationPress?: () => void;
  themeMode?: MaterialToolbarThemeMode;
  dynamicColor?: boolean;
  style?: StyleProp<ViewStyle>;
};
