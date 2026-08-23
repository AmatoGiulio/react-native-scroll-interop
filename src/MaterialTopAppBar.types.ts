import type { StyleProp, ViewStyle } from 'react-native';

import type { MaterialToolbarThemeMode } from './MaterialToolbar.types';

export type MaterialTopAppBarVariant = 'small' | 'medium' | 'large';
export type MaterialTopAppBarScrollBehavior =
  | 'none'
  | 'pinned'
  | 'enterAlways'
  | 'exitUntilCollapsed';
export type MaterialTopAppBarNavigationIcon = 'none' | 'back';
export type MaterialTopAppBarPlacement = 'overlay' | 'header';

/**
 * Native Android Material3 TopAppBar driven by the same real nested-scroll transaction as the
 * React Native scroll source.
 *
 * The component is navigation-library agnostic. When it is used as a custom navigator header,
 * use `placement="header"`; the component then owns its Material3 expanded height and top safe
 * inset so navigation layouts do not need platform-specific sizing styles.
 */
export type MaterialTopAppBarProps = {
  title: string;
  visible?: boolean;
  variant?: MaterialTopAppBarVariant;
  scrollBehavior?: MaterialTopAppBarScrollBehavior;
  navigationIcon?: MaterialTopAppBarNavigationIcon;
  navigationAccessibilityLabel?: string;
  onNavigationPress?: () => void;
  placement?: MaterialTopAppBarPlacement;
  themeMode?: MaterialToolbarThemeMode;
  dynamicColor?: boolean;
  style?: StyleProp<ViewStyle>;
};
