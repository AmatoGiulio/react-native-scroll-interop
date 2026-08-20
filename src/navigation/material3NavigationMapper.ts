import type {
  MaterialTopAppBarScrollBehavior,
  MaterialTopAppBarVariant,
} from '../MaterialTopAppBar.types';
import type { MaterialToolbarThemeMode } from '../MaterialToolbar.types';

export type Material3TopAppBarNavigationOptions = {
  variant?: MaterialTopAppBarVariant;
  scrollBehavior?: MaterialTopAppBarScrollBehavior;
  themeMode?: MaterialToolbarThemeMode;
  dynamicColor?: boolean;
  navigationAccessibilityLabel?: string;
};

export type Material3StackNavigationOptions = {
  /** Keep the navigation library's native header instead of a Material3 header. */
  topAppBar?: false | Material3TopAppBarNavigationOptions;
};

export type Material3NavigationOptions = {
  title?: unknown;
  headerTitle?: unknown;
  headerLargeTitle?: unknown;
  headerLargeTitleEnabled?: unknown;
  headerBackVisible?: unknown;
  headerShown?: unknown;
  headerTransparent?: unknown;
  header?: unknown;
  unstable_nativeProps?: unknown;
  material3?: Material3StackNavigationOptions;
  [key: string]: unknown;
};

export type Material3ResolvedTopAppBar = {
  title: string;
  variant: MaterialTopAppBarVariant;
  scrollBehavior: MaterialTopAppBarScrollBehavior;
  navigationIcon: 'none' | 'back';
  navigationAccessibilityLabel?: string;
  themeMode?: MaterialToolbarThemeMode;
  dynamicColor?: boolean;
};

export type Material3HeaderDecision =
  | {
      kind: 'passthrough';
      navigationOptions: Material3NavigationOptions;
    }
  | {
      kind: 'native';
      navigationOptions: Material3NavigationOptions;
    }
  | {
      kind: 'material3';
      navigationOptions: Material3NavigationOptions;
      topAppBar: Material3ResolvedTopAppBar;
    };

const SUPPORTED_HEADER_KEYS = new Set([
  'header',
  'headerShown',
  'headerTransparent',
  'headerTitle',
  'headerLargeTitle',
  'headerLargeTitleEnabled',
  'headerBackVisible',
]);

export function splitMaterial3NavigationOptions<T extends Material3NavigationOptions>(
  options: T
): {
  material3: Material3StackNavigationOptions | undefined;
  navigationOptions: Omit<T, 'material3'>;
} {
  const { material3, ...navigationOptions } = options;
  return { material3, navigationOptions };
}

export function hasUnsupportedMaterial3HeaderOptions(
  options: Material3NavigationOptions
): boolean {
  if (typeof options.headerTitle === 'function') return true;
  if (options.unstable_nativeProps !== undefined) return true;

  return Object.keys(options).some(
    (key) =>
      (key.startsWith('header') || key.startsWith('unstable_header')) &&
      !SUPPORTED_HEADER_KEYS.has(key)
  );
}

function resolveTitle(options: Material3NavigationOptions, routeName: string): string {
  if (typeof options.headerTitle === 'string') return options.headerTitle;
  if (typeof options.title === 'string') return options.title;
  return routeName;
}

function resolveTopAppBar(
  options: Material3NavigationOptions,
  config: Material3TopAppBarNavigationOptions | undefined,
  routeName: string,
  canGoBack: boolean
): Material3ResolvedTopAppBar {
  const largeTitleEnabled =
    options.headerLargeTitleEnabled === true || options.headerLargeTitle === true;
  const variant: MaterialTopAppBarVariant =
    config?.variant ?? (largeTitleEnabled ? 'large' : 'small');
  const scrollBehavior: MaterialTopAppBarScrollBehavior =
    config?.scrollBehavior ?? (variant === 'large' ? 'exitUntilCollapsed' : 'none');
  const showBack = canGoBack && options.headerBackVisible !== false;

  return {
    title: resolveTitle(options, routeName),
    variant,
    scrollBehavior,
    navigationIcon: showBack ? 'back' : 'none',
    navigationAccessibilityLabel: config?.navigationAccessibilityLabel,
    themeMode: config?.themeMode,
    dynamicColor: config?.dynamicColor,
  };
}

export function resolveMaterial3HeaderDecision(input: {
  options: Material3NavigationOptions;
  routeName: string;
  canGoBack: boolean;
  platform: string;
  scope: 'root' | 'screen';
}): Material3HeaderDecision {
  const { material3, navigationOptions } = splitMaterial3NavigationOptions(input.options);

  if (input.platform !== 'android') {
    return { kind: 'passthrough', navigationOptions };
  }

  if (navigationOptions.header !== undefined) {
    return { kind: 'passthrough', navigationOptions };
  }

  const needsNativeHeader =
    navigationOptions.headerShown === false ||
    navigationOptions.headerTransparent === false ||
    hasUnsupportedMaterial3HeaderOptions(navigationOptions);

  if (input.scope === 'root' && material3?.topAppBar === false) {
    return { kind: 'passthrough', navigationOptions };
  }

  if (input.scope === 'root' && needsNativeHeader) {
    return { kind: 'passthrough', navigationOptions };
  }

  if (input.scope === 'screen' && material3 === undefined) {
    return {
      kind: needsNativeHeader ? 'native' : 'passthrough',
      navigationOptions,
    };
  }

  if (input.scope === 'screen' && (material3?.topAppBar === false || needsNativeHeader)) {
    return { kind: 'native', navigationOptions };
  }

  return {
    kind: 'material3',
    navigationOptions,
    topAppBar: resolveTopAppBar(
      navigationOptions,
      material3?.topAppBar === false ? undefined : material3?.topAppBar,
      input.routeName,
      input.canGoBack
    ),
  };
}
