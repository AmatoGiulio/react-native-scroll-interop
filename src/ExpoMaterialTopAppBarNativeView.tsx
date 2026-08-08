import type { ViewProps } from 'react-native';

import { requireToolbarView } from './native/requireToolbarView';

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

export default requireToolbarView<NativeMaterialTopAppBarProps>(
  'ExpoMaterialTopAppBar',
  'MaterialTopAppBarView',
);
