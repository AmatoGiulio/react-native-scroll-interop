import type { ComponentType, RefAttributes } from 'react';
import type { ColorValue, NativeSyntheticEvent, ViewProps } from 'react-native';

import { requireToolbarView } from './native/requireToolbarView';

import type {
  MaterialToolbarAlignment,
  MaterialToolbarFabPosition,
  MaterialToolbarFabShape,
  MaterialToolbarImeBehavior,
  MaterialToolbarInsets,
  MaterialToolbarOrientation,
  MaterialToolbarRef,
  MaterialToolbarScrollBehavior,
  MaterialToolbarScrollExitDirection,
  MaterialToolbarThemeMode,
  MaterialToolbarVariant,
} from './MaterialToolbar.types';

export type NativeToolbarAction = {
  id: string;
  presentation: 'icon' | 'text';
  label: string;
  enabled: boolean;
  accessibilityLabel?: string;
  iconPresent: boolean;
  iconUri?: string;
  iconTintable: boolean;
  iconSize: number;
  iconFallback: 'initial' | 'none';
  selected: boolean;
};

export type NativeMaterialToolbarProps = ViewProps & {
  content: NativeToolbarAction[];
  leadingContent: NativeToolbarAction[];
  trailingContent: NativeToolbarAction[];
  visible: boolean;
  expanded: boolean;
  scrollBehavior: MaterialToolbarScrollBehavior;
  scrollExitDirection: MaterialToolbarScrollExitDirection | 'auto';
  orientation: MaterialToolbarOrientation;
  variant: MaterialToolbarVariant;

  fabPresent: boolean;
  fabPosition: MaterialToolbarFabPosition;
  fabIconUri?: string;
  fabIconTintable: boolean;
  fabIconSize: number;
  fabIconFallback: 'initial' | 'none';
  fabAccessibilityLabel?: string;
  fabShape: MaterialToolbarFabShape;

  themeMode: MaterialToolbarThemeMode;
  dynamicColor: boolean;
  imeBehavior: MaterialToolbarImeBehavior;
  alignment: MaterialToolbarAlignment;
  insets: MaterialToolbarInsets;
  edgeOffset?: number;

  contentPaddingStart?: number;
  contentPaddingTop?: number;
  contentPaddingEnd?: number;
  contentPaddingBottom?: number;
  expandedShadowElevation?: number;
  collapsedShadowElevation?: number;

  toolbarContainerColor?: ColorValue;
  toolbarContentColor?: ColorValue;
  fabContainerColor?: ColorValue;
  fabContentColor?: ColorValue;
  selectedContainerColor?: ColorValue;
  selectedContentColor?: ColorValue;
  unselectedContentColor?: ColorValue;

  onActionPress?: (event: NativeSyntheticEvent<{ id: string }>) => void;
  onFabPress?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
};

type NativeComponent = ComponentType<
  NativeMaterialToolbarProps & RefAttributes<MaterialToolbarRef>
>;

export default requireToolbarView<
  NativeMaterialToolbarProps & RefAttributes<MaterialToolbarRef>
>('ExpoMaterialToolbar', 'MaterialToolbarView') as NativeComponent;
