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

import { Material3NavigationHeader } from './src/navigation/Material3NavigationHeader';
import {
  resolveMaterial3Navigation,
  type Material3NavigationOptionBag,
  type Material3NavigationScope,
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

function createMaterial3Header(
  config: Material3TopAppBarNavigationOptions | undefined
): NonNullable<ExpoStackScreenOptionsObject['header']> {
  return (headerProps: NativeStackHeaderProps) => (
    <Material3NavigationHeader
      routeName={headerProps.route.name}
      options={headerProps.options as Material3NavigationOptionBag}
      canGoBack={headerProps.back != null}
      goBack={() => headerProps.navigation.goBack()}
      config={config}
    />
  );
}

function applyMaterial3Navigation(
  options: RuntimeNavigationOptions,
  scope: Material3NavigationScope
): RuntimeNavigationOptions {
  const decision = resolveMaterial3Navigation(options as Material3NavigationOptionBag, {
    platform: Platform.OS,
    scope,
  });

  if (decision.kind !== 'material3') {
    return decision.navigationOptions as RuntimeNavigationOptions;
  }

  return {
    ...decision.navigationOptions,
    header: createMaterial3Header(decision.topAppBar),
  } as RuntimeNavigationOptions;
}

function transformOptions<T>(options: T | undefined, scope: Material3NavigationScope): T {
  if (typeof options === 'function') {
    const factory = options as (...args: unknown[]) => RuntimeNavigationOptions;
    return ((...args: unknown[]) =>
      applyMaterial3Navigation(factory(...args) ?? {}, scope)) as T;
  }

  return applyMaterial3Navigation((options ?? {}) as RuntimeNavigationOptions, scope) as T;
}

function transformScreenChild(child: ReactNode): ReactNode {
  if (!isValidElement(child)) return child;

  if (child.type === ExpoStack.Screen) {
    const screen = child as ReactElement<MaterialStackScreenProps>;
    if (screen.props.options === undefined) return child;

    return cloneElement(screen, {
      options: transformOptions(screen.props.options, 'screen'),
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
        : (transformOptions(screenOptions, 'root') as ExpoStackProps['screenOptions']),
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

/** Thin Expo Router adapter over the navigator-neutral Material3 mapping layer. */
export const Stack = Object.assign(MaterialStack, ExpoStack) as MaterialStackComponent;
