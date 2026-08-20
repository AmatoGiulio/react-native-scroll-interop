import type {
  NativeStackHeaderProps,
  NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import { Platform } from 'react-native';

import { MaterialTopAppBar } from './src/MaterialTopAppBar';
import {
  resolveMaterial3HeaderDecision,
  type Material3NavigationOptions,
  type Material3StackNavigationOptions,
  type Material3TopAppBarNavigationOptions,
} from './src/navigation/material3NavigationMapper';

export type {
  Material3StackNavigationOptions,
  Material3TopAppBarNavigationOptions,
} from './src/navigation/material3NavigationMapper';

export type Material3NativeStackNavigationOptions = NativeStackNavigationOptions & {
  material3?: Material3StackNavigationOptions;
};

function nativeHeaderFallback(
  navigationOptions: Material3NavigationOptions
): NativeStackNavigationOptions {
  return {
    ...(navigationOptions as NativeStackNavigationOptions),
    header: undefined,
    headerTransparent: navigationOptions.headerTransparent === true,
  };
}

function createMaterial3Header(
  options: Material3NativeStackNavigationOptions,
  scope: 'root' | 'screen'
): NonNullable<NativeStackNavigationOptions['header']> {
  return (headerProps: NativeStackHeaderProps) => {
    const decision = resolveMaterial3HeaderDecision({
      options: options as Material3NavigationOptions,
      routeName: headerProps.route.name,
      canGoBack: headerProps.back != null,
      platform: Platform.OS,
      scope,
    });

    if (decision.kind !== 'material3') return null;

    const topAppBar = decision.topAppBar;
    const canGoBack = topAppBar.navigationIcon === 'back';

    return (
      <MaterialTopAppBar
        placement="header"
        title={topAppBar.title}
        variant={topAppBar.variant}
        scrollBehavior={topAppBar.scrollBehavior}
        navigationIcon={topAppBar.navigationIcon}
        navigationAccessibilityLabel={topAppBar.navigationAccessibilityLabel}
        onNavigationPress={canGoBack ? () => headerProps.navigation.goBack() : undefined}
        themeMode={topAppBar.themeMode}
        dynamicColor={topAppBar.dynamicColor}
      />
    );
  };
}

function mapOptions(
  options: Material3NativeStackNavigationOptions,
  scope: 'root' | 'screen'
): NativeStackNavigationOptions {
  const decision = resolveMaterial3HeaderDecision({
    options: options as Material3NavigationOptions,
    routeName: '',
    canGoBack: false,
    platform: Platform.OS,
    scope,
  });

  if (decision.kind === 'native') {
    return nativeHeaderFallback(decision.navigationOptions);
  }

  if (decision.kind === 'passthrough') {
    return decision.navigationOptions as NativeStackNavigationOptions;
  }

  return {
    ...(decision.navigationOptions as NativeStackNavigationOptions),
    headerTransparent: true,
    header: createMaterial3Header(options, scope),
  };
}

/**
 * Maps navigator-level React Navigation native-stack options to the shared Material3 header model.
 * No nested-scroll logic lives in this adapter; it only translates navigation state to Material UI.
 */
export function material3NativeStackNavigatorOptions(
  options: Material3NativeStackNavigationOptions = {}
): NativeStackNavigationOptions {
  return mapOptions(options, 'root');
}

/**
 * Maps screen-level React Navigation native-stack options to the shared Material3 header model.
 * Screen options without a `material3` override preserve navigator-level behavior.
 */
export function material3NativeStackScreenOptions(
  options: Material3NativeStackNavigationOptions = {}
): NativeStackNavigationOptions {
  return mapOptions(options, 'screen');
}

/** Wrap a React Navigation screenOptions/options factory without duplicating Material3 mapping. */
export function withMaterial3NativeStackOptions<TArgs extends unknown[]>(
  factory: (...args: TArgs) => Material3NativeStackNavigationOptions,
  scope: 'root' | 'screen' = 'screen'
): (...args: TArgs) => NativeStackNavigationOptions {
  return (...args: TArgs) => mapOptions(factory(...args) ?? {}, scope);
}
