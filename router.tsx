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
import type {
  MaterialTopAppBarScrollBehavior,
  MaterialTopAppBarVariant,
} from './src/MaterialTopAppBar.types';
import type { MaterialToolbarThemeMode } from './src/MaterialToolbar.types';

/**
 * Android Material3 options layered on top of Expo Router's existing native-stack options.
 * Standard Expo Router / React Navigation options remain the primary API.
 */
export type Material3TopAppBarNavigationOptions = {
  variant?: MaterialTopAppBarVariant;
  scrollBehavior?: MaterialTopAppBarScrollBehavior;
  themeMode?: MaterialToolbarThemeMode;
  dynamicColor?: boolean;
  navigationAccessibilityLabel?: string;
};

export type Material3StackNavigationOptions = {
  /** Keep the platform-native Expo/React Navigation header on Android. */
  topAppBar?: false | Material3TopAppBarNavigationOptions;
};

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

type SplitMaterial3Options = {
  material3: Material3StackNavigationOptions | undefined;
  navigationOptions: ExpoStackScreenOptionsObject;
};

const UNSUPPORTED_MATERIAL_HEADER_KEYS = [
  'headerLeft',
  'headerRight',
  'unstable_headerLeftItems',
  'unstable_headerRightItems',
  'headerBackground',
  'headerSearchBarOptions',
  'headerBackIcon',
  'headerBackImageSource',
  'headerStyle',
  'headerTintColor',
  'headerTitleAlign',
  'headerTitleStyle',
  'headerShadowVisible',
] as const satisfies readonly (keyof ExpoStackScreenOptionsObject)[];

function splitMaterial3(options: RuntimeNavigationOptions): SplitMaterial3Options {
  const { material3, ...navigationOptions } = options;
  return { material3, navigationOptions };
}

function hasUnsupportedMaterialHeaderOptions(
  options: ExpoStackScreenOptionsObject
): boolean {
  if (typeof options.headerTitle === 'function') return true;
  return UNSUPPORTED_MATERIAL_HEADER_KEYS.some((key) => options[key] !== undefined);
}

function resolveTitle(headerProps: NativeStackHeaderProps): string {
  const headerTitle = headerProps.options.headerTitle;
  if (typeof headerTitle === 'string') return headerTitle;

  const title = headerProps.options.title;
  if (typeof title === 'string') return title;

  return headerProps.route.name;
}

function createMaterial3Header(
  config: Material3TopAppBarNavigationOptions | undefined
): NonNullable<ExpoStackScreenOptionsObject['header']> {
  return (headerProps: NativeStackHeaderProps) => {
    const options = headerProps.options;
    const largeTitleEnabled =
      options.headerLargeTitleEnabled === true || options.headerLargeTitle === true;
    const variant: MaterialTopAppBarVariant =
      config?.variant ?? (largeTitleEnabled ? 'large' : 'small');
    const scrollBehavior: MaterialTopAppBarScrollBehavior =
      config?.scrollBehavior ?? (variant === 'large' ? 'exitUntilCollapsed' : 'none');
    const canGoBack = headerProps.back != null && options.headerBackVisible !== false;

    return (
      <MaterialTopAppBar
        placement="header"
        title={resolveTitle(headerProps)}
        variant={variant}
        scrollBehavior={scrollBehavior}
        navigationIcon={canGoBack ? 'back' : 'none'}
        navigationAccessibilityLabel={config?.navigationAccessibilityLabel}
        onNavigationPress={canGoBack ? () => headerProps.navigation.goBack() : undefined}
        themeMode={config?.themeMode}
        dynamicColor={config?.dynamicColor}
      />
    );
  };
}

function nativeHeaderFallback(
  navigationOptions: ExpoStackScreenOptionsObject
): ExpoStackScreenOptionsObject {
  return {
    ...navigationOptions,
    // Cancel a Material header inherited from root screenOptions.
    header: undefined,
    headerTransparent: navigationOptions.headerTransparent ?? false,
  };
}

/** Root screenOptions establish Material3 as the Android default. */
function applyRootMaterial3(options: RuntimeNavigationOptions): RuntimeNavigationOptions {
  const { material3, navigationOptions } = splitMaterial3(options);

  if (Platform.OS !== 'android') return navigationOptions;
  if (navigationOptions.header !== undefined) return navigationOptions;
  if (material3?.topAppBar === false) return navigationOptions;
  if (
    navigationOptions.headerTransparent === false ||
    hasUnsupportedMaterialHeaderOptions(navigationOptions)
  ) {
    return navigationOptions;
  }

  return {
    ...navigationOptions,
    headerTransparent: true,
    header: createMaterial3Header(material3?.topAppBar),
  };
}

/** Per-screen Material3 is an explicit override; unsupported header options fall back losslessly. */
function applyScreenMaterial3(options: RuntimeNavigationOptions): RuntimeNavigationOptions {
  const { material3, navigationOptions } = splitMaterial3(options);

  if (Platform.OS !== 'android') return navigationOptions;
  if (navigationOptions.header !== undefined) return navigationOptions;

  const needsNativeHeader =
    navigationOptions.headerTransparent === false ||
    hasUnsupportedMaterialHeaderOptions(navigationOptions);

  if (material3 === undefined) {
    return needsNativeHeader ? nativeHeaderFallback(navigationOptions) : navigationOptions;
  }

  if (material3.topAppBar === false || needsNativeHeader) {
    return nativeHeaderFallback(navigationOptions);
  }

  return {
    ...navigationOptions,
    headerTransparent: true,
    header: createMaterial3Header(material3.topAppBar),
  };
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

/**
 * Expo Router Stack with Android Material3 TopAppBar translation.
 *
 * Navigation remains owned by Expo Router / React Navigation / react-native-screens. iOS and web
 * preserve the existing native-stack behavior; Android replaces the default header only when its
 * options can be translated without dropping behavior.
 */
export const Stack = Object.assign(MaterialStack, ExpoStack) as MaterialStackComponent;

export default Stack;
