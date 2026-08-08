import { requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

import type {
  MaterialTopAppBarScrollBehavior,
  MaterialTopAppBarVariant,
} from './MaterialTopAppBar.types';
import type { MaterialToolbarThemeMode } from './MaterialToolbar.types';

export type NativeMaterialTopAppBarProps = ViewProps & {
  title: string;
  visible: boolean;
  variant: MaterialTopAppBarVariant;
  scrollBehavior: MaterialTopAppBarScrollBehavior;
  themeMode: MaterialToolbarThemeMode;
  dynamicColor: boolean;
};

export default requireNativeViewManager('ExpoMaterialTopAppBar') as ComponentType<NativeMaterialTopAppBarProps>;
