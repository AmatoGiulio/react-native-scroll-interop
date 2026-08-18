import type { StyleProp, ViewStyle } from 'react-native';

import type { MaterialToolbarThemeMode } from './MaterialToolbar.types';

export type MaterialTopAppBarVariant = 'small' | 'medium' | 'large';
export type MaterialTopAppBarScrollBehavior = 'none' | 'enterAlways' | 'exitUntilCollapsed';

/**
 * Native Android Material3 TopAppBar driven by the same real nested-scroll transaction as the
 * React Native scroll source. The API remains intentionally small while the package is in alpha,
 * but it is part of the supported public surface rather than an internal proof-of-concept type.
 */
export type MaterialTopAppBarProps = {
  title: string;
  visible?: boolean;
  variant?: MaterialTopAppBarVariant;
  scrollBehavior?: MaterialTopAppBarScrollBehavior;
  themeMode?: MaterialToolbarThemeMode;
  dynamicColor?: boolean;
  style?: StyleProp<ViewStyle>;
};
