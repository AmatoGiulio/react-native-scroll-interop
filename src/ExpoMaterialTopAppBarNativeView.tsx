import type { ComponentType } from 'react';
import {
  requireNativeComponent,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';

import type {
  MaterialTopAppBarNavigationIcon,
  MaterialTopAppBarScrollBehavior,
  MaterialTopAppBarVariant,
} from './MaterialTopAppBar.types';
import type { MaterialToolbarThemeMode } from './MaterialToolbar.types';

export type NativeMaterialTopAppBarProps = ViewProps & {
  title: string;
  visible: boolean;
  variant: MaterialTopAppBarVariant;
  scrollBehavior: MaterialTopAppBarScrollBehavior;
  navigationIcon: MaterialTopAppBarNavigationIcon;
  navigationAccessibilityLabel: string;
  themeMode: MaterialToolbarThemeMode;
  dynamicColor: boolean;
  onNavigationPress?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
};

export default requireNativeComponent<NativeMaterialTopAppBarProps>(
  'RNSIMaterialTopAppBar'
) as ComponentType<NativeMaterialTopAppBarProps>;
