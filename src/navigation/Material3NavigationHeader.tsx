import React from 'react';

import { MaterialTopAppBar } from '../MaterialTopAppBar';
import {
  resolveMaterial3TopAppBarDescriptor,
  type Material3NavigationOptionBag,
  type Material3TopAppBarNavigationOptions,
} from './material3NavigationMapper';

export type Material3NavigationHeaderProps = {
  routeName: string;
  options: Material3NavigationOptionBag;
  canGoBack: boolean;
  goBack?: () => void;
  config?: Material3TopAppBarNavigationOptions;
};

/** Reference Material3 header renderer shared by navigation adapters. */
export function Material3NavigationHeader({
  routeName,
  options,
  canGoBack,
  goBack,
  config,
}: Material3NavigationHeaderProps) {
  const descriptor = resolveMaterial3TopAppBarDescriptor({
    routeName,
    options,
    canGoBack,
    config,
  });

  return (
    <MaterialTopAppBar
      placement="header"
      title={descriptor.title}
      variant={descriptor.variant}
      scrollBehavior={descriptor.scrollBehavior}
      navigationIcon={descriptor.navigationIcon}
      navigationAccessibilityLabel={descriptor.navigationAccessibilityLabel}
      onNavigationPress={descriptor.navigationIcon === 'back' ? goBack : undefined}
      themeMode={descriptor.themeMode}
      dynamicColor={descriptor.dynamicColor}
    />
  );
}
