import type { StyleProp, ViewStyle } from 'react-native';

import type { MaterialToolbarThemeMode } from './MaterialToolbar.types';

export type MaterialTopAppBarVariant = 'small' | 'medium' | 'large';
export type MaterialTopAppBarScrollBehavior = 'none' | 'enterAlways' | 'exitUntilCollapsed';

/**
 * Experimental PoC surface used to validate the generic native-scroll coordinator against a
 * second real Material3 consumer. The API is intentionally minimal in alpha.24.
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
