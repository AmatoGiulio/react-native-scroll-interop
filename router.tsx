import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import {
  Stack as ExpoStack,
  type NativeStackHeaderProps,
} from 'expo-router';

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

type WithMaterial3<T> = T extends (...args: infer TArgs) => infer TResult
  ? (...args: TArgs) => TResult & { material3?: Material3StackNavigationOptions }
  : T & { material3?: Material3StackNavigationOptions };

type NonFunction<T> = T extends (...args: infer _TArgs) => infer _TResult ? never : T;
type FunctionArgs<T> = T extends (...args: infer TArgs) => infer _TResult ? TArgs : never;

type ExpoStackProps = ComponentProps<typeof ExpoStack>;
type ExpoStackScreenProps = ComponentProps<typeof ExpoStack.Screen>;
type ExpoStackScreenOptions = NonNullable<ExpoStackScreenProps['options']>;
type ExpoStackScreenOptionsObject = NonFunction<ExpoStackScreenOptions>;
type ExpoStackScreenOptionsArgs = FunctionArgs<ExpoStackScreenOptions>;

export type MaterialStackNavigationOptions = ExpoStackScreenOptionsObject & {
  material3?: Material3StackNavigationOptions;
};

export type MaterialStackScreenOptions =
  | MaterialStackNavigationOptions
  | ((...args: ExpoStackScreenOptionsArgs) => MaterialStackNavigationOptions);

export type MaterialStackScreenProps = Omit<ExpoStackScreenProps, 'options'> & {
  options?: MaterialStackScreenOptions;
};

export type MaterialStackProps = Omit<ExpoStackProps, 'screenOptions' | 'children'> & {
  children?: ReactNode;
  screenOptions?: WithMaterial3<NonNullable<ExpoStackProps['screenOptions']>>;
};

type RuntimeNavigationOptions = MaterialStackNavigationOptions;

function nativeHeaderFallback(
  navigationOptions: Material3NavigationOptions
): ExpoStackScreenOptionsObject {
  return {
    ...(navigationOptions as ExpoStackScreenOptionsObject),
    // Cancel a Material header inherited from root screenOptions.
    header: undefined,
    headerTransparent:
      typeof navigationOptions.headerTransparent === 'boolean'
        ? navigationOptions.headerTransparent
        : false,
  };
}

function createMaterial3Header(
  options: RuntimeNavigationOptions,
  scope: 'root' | 'screen'
): NonNullable<ExpoStackScreenOptionsObject['header']> {
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

function mapMaterial3Options(
  options: RuntimeNavigationOptions,
  scope: 'root' | 'screen'
): RuntimeNavigationOptions {
  const decision = resolveMaterial3HeaderDecision({
    options: options as Material3NavigationOptions,
    routeName: '',
    canGoBack: false,
    platform: Platform.OS,
    scope,
  });

  if (decision.kind === 'native') {
    return nativeHeaderFallback(decision.navigationOptions) as RuntimeNavigationOptions;
  }

  if (decision.kind === 'passthrough') {
    return decision.navigationOptions as RuntimeNavigationOptions;
  }

  return {
    ...(decision.navigationOptions as RuntimeNavigationOptions),
    headerTransparent: true,
    header: createMaterial3Header(options, scope),
  };
}

function applyRootMaterial3(options: RuntimeNavigationOptions): RuntimeNavigationOptions {
  return mapMaterial3Options(options, 'root');
}

function applyScreenMaterial3(options: RuntimeNavigationOptions): RuntimeNavigationOptions {
  return mapMaterial3Options(options, 'screen');
}

function transformOptions<T>(
  options: T | undefined,
  transform: (value: RuntimeNavigationOptions) => RuntimeNavigationOptions
): T {
  if (typeof options === 'function') {
    const factory = options as (...args: unknown[]) => RuntimeNavigationOptions;
    return ((...args: unknown[]) => transform(factory(...args) ?? {})) as T;
  }

  return transform((options ?? {}) as RuntimeNavigationOptions) as T;
}

function transformScreenChild(child: ReactNode): ReactNode {
  if (!isValidElement(child)) return child;

  if (child.type === ExpoStack.Screen) {
    const screen = child as ReactElement<MaterialStackScreenProps>;
    if (screen.props.options === undefined) return child;

    return cloneElement(screen, {
      options: transformOptions(screen.props.options, applyScreenMaterial3),
    });
  }

  if (child.type === ExpoStack.Protected) {
    const protectedElement = child as ReactElement<{ children?: ReactNode }>;
    return cloneElement(protectedElement, {
      children: Children.map(protectedElement.props.children, transformScreenChild),
    });
  }

  return child;
}

function MaterialStack({ children, screenOptions, ...props }: MaterialStackProps) {
  const resolvedScreenOptions = useMemo(
    () =>
      screenOptions === undefined && Platform.OS !== 'android'
        ? undefined
        : (transformOptions(screenOptions, applyRootMaterial3) as ExpoStackProps['screenOptions']),
    [screenOptions]
  );

  const resolvedChildren = useMemo(
    () => Children.map(children, transformScreenChild),
    [children]
  );

  return (
    <ExpoStack
      {...(props as ExpoStackProps)}
      screenOptions={resolvedScreenOptions}
    >
      {resolvedChildren}
    </ExpoStack>
  );
}

type MaterialStackComponent = typeof ExpoStack & {
  (props: MaterialStackProps): ReactNode;
  Screen: typeof ExpoStack.Screen & ((props: MaterialStackScreenProps) => ReactNode);
};

/** Expo Router adapter over the shared Material3/navigation mapper. */
export const Stack = Object.assign(MaterialStack, ExpoStack) as MaterialStackComponent;
