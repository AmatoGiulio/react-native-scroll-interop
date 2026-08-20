import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import { Material3NavigationHeader } from './src/navigation/Material3NavigationHeader';
import {
  resolveMaterial3Navigation,
  type Material3NavigationOptionBag,
  type Material3NavigationScope,
  type Material3StackNavigationOptions,
  type Material3TopAppBarNavigationOptions,
} from './src/navigation/material3NavigationMapper';

/** Structural native-stack header props consumed by the adapter. */
export type Material3ReactNavigationHeaderProps = {
  options: Material3ReactNavigationOptions;
  route: { name: string };
  back?: unknown;
  navigation: { goBack(): void };
};

export type Material3ReactNavigationOptions = Material3NavigationOptionBag & {
  material3?: Material3StackNavigationOptions;
  header?: ((props: Material3ReactNavigationHeaderProps) => ReactNode) | undefined;
};

function createMaterial3Header(config: Material3TopAppBarNavigationOptions | undefined) {
  return (headerProps: Material3ReactNavigationHeaderProps) => (
    <Material3NavigationHeader
      routeName={headerProps.route.name}
      options={headerProps.options}
      canGoBack={headerProps.back != null}
      goBack={() => headerProps.navigation.goBack()}
      config={config}
    />
  );
}

function applyMaterial3Navigation(
  options: Material3ReactNavigationOptions,
  scope: Material3NavigationScope
): Material3ReactNavigationOptions {
  const decision = resolveMaterial3Navigation(options, {
    platform: Platform.OS,
    scope,
  });

  if (decision.kind !== 'material3') {
    return decision.navigationOptions as Material3ReactNavigationOptions;
  }

  return {
    ...decision.navigationOptions,
    header: createMaterial3Header(decision.topAppBar),
  } as Material3ReactNavigationOptions;
}

function transformOptions<T>(options: T, scope: Material3NavigationScope): T {
  if (typeof options === 'function') {
    const factory = options as (...args: unknown[]) => Material3ReactNavigationOptions;
    return ((...args: unknown[]) =>
      applyMaterial3Navigation(factory(...args) ?? {}, scope)) as T;
  }

  return applyMaterial3Navigation(
    (options ?? {}) as Material3ReactNavigationOptions,
    scope
  ) as T;
}

/** Wrap React Navigation native-stack navigator `screenOptions`. */
export function material3NativeStackNavigatorOptions<T>(screenOptions: T): T {
  return transformOptions(screenOptions, 'root');
}

/** Wrap React Navigation native-stack per-screen `options`. */
export function material3NativeStackScreenOptions<T>(options: T): T {
  return transformOptions(options, 'screen');
}

/** Wrap a native-stack options factory without adding navigation or scroll state. */
export function withMaterial3NativeStackOptions<TArgs extends unknown[]>(
  factory: (...args: TArgs) => Material3ReactNavigationOptions,
  scope: Material3NavigationScope = 'screen'
): (...args: TArgs) => Material3ReactNavigationOptions {
  return (...args: TArgs) => applyMaterial3Navigation(factory(...args) ?? {}, scope);
}

export type {
  Material3StackNavigationOptions,
  Material3TopAppBarNavigationOptions,
} from './src/navigation/material3NavigationMapper';
