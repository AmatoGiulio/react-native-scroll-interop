import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { Stack as ExpoStack } from 'expo-router';

import { MaterialTopAppBar } from './src/MaterialTopAppBar';
import type {
  MaterialTopAppBarScrollBehavior,
  MaterialTopAppBarVariant,
} from './src/MaterialTopAppBar.types';
import type { MaterialToolbarThemeMode } from './src/MaterialToolbar.types';

/**
 * Android Material3 options layered on top of Expo Router's existing native-stack options.
 *
 * Standard Expo Router / React Navigation options remain the primary API. This namespace is only
 * for Material3 behavior that does not have a cross-platform navigation equivalent yet.
 */
export type Material3TopAppBarNavigationOptions = {
  variant?: MaterialTopAppBarVariant;
  scrollBehavior?: MaterialTopAppBarScrollBehavior;
  themeMode?: MaterialToolbarThemeMode;
  dynamicColor?: boolean;
  navigationAccessibilityLabel?: string;
};

export type Material3StackNavigationOptions = {
  /** Set to false to keep the platform-native Expo/React Navigation header on Android. */
  topAppBar?: false | Material3TopAppBarNavigationOptions;
};

type WithMaterial3<T> = T extends (...args: infer TArgs) => infer TResult
  ? (...args: TArgs) => TResult & { material3?: Material3StackNavigationOptions }
  : T & { material3?: Material3StackNavigationOptions };

type ExpoStackProps = ComponentProps<typeof ExpoStack>;
type ExpoStackScreenProps = ComponentProps<typeof ExpoStack.Screen>;

type ExpoStackScreenOptions = NonNullable<ExpoStackScreenProps['options']>;
type ExpoStackScreenOptionsObject = Exclude<ExpoStackScreenOptions, (...args: any[]) => any>;

type ExpoStackScreenOptionsFactory = Extract<
  ExpoStackScreenOptions,
  (...args: any[]) => any
>;

export type MaterialStackNavigationOptions = ExpoStackScreenOptionsObject & {
  material3?: Material3StackNavigationOptions;
};

export type MaterialStackScreenOptions =
  | MaterialStackNavigationOptions
  | (ExpoStackScreenOptionsFactory extends (...args: infer TArgs) => any
      ? (...args: TArgs) => MaterialStackNavigationOptions
      : never);

export type MaterialStackScreenProps = Omit<ExpoStackScreenProps, 'options'> & {
  options?: MaterialStackScreenOptions;
};

type MaterialStackProps = Omit<ExpoStackProps, 'screenOptions' | 'children'> & {
  children?: ReactNode;
  screenOptions?: WithMaterial3<NonNullable<ExpoStackProps['screenOptions']>>;
};

type RuntimeNavigationOptions = Record<string, any> & {
  material3?: Material3StackNavigationOptions;
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
] as const;

function splitMaterial3(options: RuntimeNavigationOptions) {
  const { material3, ...navigationOptions } = options;
  return { material3, navigationOptions };
}

function hasUnsupportedMaterialHeaderOptions(options: RuntimeNavigationOptions): boolean {
  if (typeof options.headerTitle === 'function') return true;
  return UNSUPPORTED_MATERIAL_HEADER_KEYS.some((key) => options[key] !== undefined);
}

function resolveTitle(headerProps: any): string {
  const headerTitle = headerProps.options?.headerTitle;
  if (typeof headerTitle === 'string') return headerTitle;

  const title = headerProps.options?.title;
  if (typeof title === 'string') return title;

  return headerProps.route?.name ?? '';
}

function createMaterial3Header(
  config: Material3TopAppBarNavigationOptions | undefined
) {
  return (headerProps: any) => {
    const options = headerProps.options ?? {};
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

/** Root screenOptions establish Material3 as the Android default. */
function applyRootMaterial3(options: RuntimeNavigationOptions): RuntimeNavigationOptions {
  const { material3, navigationOptions } = splitMaterial3(options);

  if (Platform.OS !== 'android') return navigationOptions;
  if (navigationOptions.header !== undefined) return navigationOptions;
  if (material3?.topAppBar === false) return navigationOptions;
  if (hasUnsupportedMaterialHeaderOptions(navigationOptions)) return navigationOptions;

  const config = material3?.topAppBar || undefined;
  return {
    ...navigationOptions,
    headerTransparent: true,
    header: createMaterial3Header(config),
  };
}

/** Per-screen material3 is an explicit override; ordinary screen options remain untouched. */
function applyScreenMaterial3(options: RuntimeNavigationOptions): RuntimeNavigationOptions {
  const { material3, navigationOptions } = splitMaterial3(options);

  if (Platform.OS !== 'android') return navigationOptions;
  if (material3 === undefined) return navigationOptions;
  if (navigationOptions.header !== undefined) return navigationOptions;

  if (material3.topAppBar === false || hasUnsupportedMaterialHeaderOptions(navigationOptions)) {
    return {
      ...navigationOptions,
      // Explicitly cancel the Material header inherited from root screenOptions.
      header: undefined,
      headerTransparent: navigationOptions.headerTransparent ?? false,
    };
  }

  return {
    ...navigationOptions,
    headerTransparent: true,
    header: createMaterial3Header(material3.topAppBar || undefined),
  };
}

function transformOptions(
  options: any,
  transform: (value: RuntimeNavigationOptions) => RuntimeNavigationOptions
) {
  if (typeof options === 'function') {
    return (...args: any[]) => transform(options(...args) ?? {});
  }
  return transform(options ?? {});
}

function transformScreenChild(child: ReactNode): ReactNode {
  if (!isValidElement(child)) return child;

  if (child.type === ExpoStack.Screen) {
    const screen = child as ReactElement<MaterialStackScreenProps>;
    const options = screen.props.options;
    if (options === undefined) return child;

    return cloneElement(screen, {
      options: transformOptions(options, applyScreenMaterial3) as MaterialStackScreenOptions,
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
  if (Platform.OS !== 'android') {
    return (
      <ExpoStack
        {...(props as ExpoStackProps)}
        screenOptions={screenOptions as ExpoStackProps['screenOptions']}
      >
        {Children.map(children, transformScreenChild)}
      </ExpoStack>
    );
  }

  const resolvedScreenOptions = transformOptions(
    screenOptions,
    applyRootMaterial3
  ) as ExpoStackProps['screenOptions'];

  return (
    <ExpoStack
      {...(props as ExpoStackProps)}
      screenOptions={resolvedScreenOptions}
    >
      {Children.map(children, transformScreenChild)}
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
 * Runtime navigation still belongs to Expo Router / React Navigation / react-native-screens. On
 * iOS and web this is a pass-through. On Android the default native-stack header is replaced with
 * MaterialTopAppBar only when the existing options can be translated without losing behavior.
 */
export const Stack = Object.assign(MaterialStack, ExpoStack) as MaterialStackComponent;

export default Stack;
