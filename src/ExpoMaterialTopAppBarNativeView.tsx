import { requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

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

export default requireNativeViewManager('ExpoMaterialTopAppBar') as ComponentType<NativeMaterialTopAppBarProps>;
