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
  /** Keep the navigator/platform-native header instead of the Material3 reference header. */
  topAppBar?: false | Material3TopAppBarNavigationOptions;
};

/** Structural native-stack option shape used by the library-independent mapper. */
export type Material3NavigationOptionBag = {
  title?: unknown;
  headerTitle?: unknown;
  headerLargeTitle?: boolean;
  headerLargeTitleEnabled?: boolean;
  headerBackVisible?: boolean;
  headerShown?: boolean;
  headerTransparent?: boolean;
  header?: unknown;
  unstable_nativeProps?: unknown;
  material3?: Material3StackNavigationOptions;
  [key: string]: unknown;
};

export type Material3NavigationScope = 'root' | 'screen';

export type Material3NavigationDecision = {
  kind: 'passthrough' | 'native-header' | 'material3';
  navigationOptions: Material3NavigationOptionBag;
  topAppBar?: Material3TopAppBarNavigationOptions;
};

export type Material3TopAppBarDescriptor = {
  title: string;
  variant: MaterialTopAppBarVariant;
  scrollBehavior: MaterialTopAppBarScrollBehavior;
  navigationIcon: 'none' | 'back';
  navigationAccessibilityLabel?: string;
  themeMode?: MaterialToolbarThemeMode;
  dynamicColor?: boolean;
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

export function hasUnsupportedMaterial3HeaderOptions(
  options: Material3NavigationOptionBag
): boolean {
  if (typeof options.headerTitle === 'function') return true;
  if (options.unstable_nativeProps !== undefined) return true;

  return Object.keys(options).some(
    (key) =>
      (key.startsWith('header') || key.startsWith('unstable_header')) &&
      !SUPPORTED_HEADER_KEYS.has(key)
  );
}

function splitMaterial3Options(options: Material3NavigationOptionBag) {
  const { material3, ...navigationOptions } = options;
  return { material3, navigationOptions };
}

function nativeHeaderFallback(
  navigationOptions: Material3NavigationOptionBag
): Material3NavigationOptionBag {
  return {
    ...navigationOptions,
    // Cancel a Material header inherited from root screenOptions.
    header: undefined,
    headerTransparent: navigationOptions.headerTransparent ?? false,
  };
}

/**
 * Resolve navigation options without importing Expo Router, React Navigation or React.
 *
 * The mapper decides only whether the adapter should pass through, restore the native header, or
 * render the Material3 reference header. It never owns navigation state or scroll transport.
 */
export function resolveMaterial3Navigation(
  options: Material3NavigationOptionBag,
  context: { platform: string; scope: Material3NavigationScope }
): Material3NavigationDecision {
  const { material3, navigationOptions } = splitMaterial3Options(options);

  if (context.platform !== 'android') {
    return { kind: 'passthrough', navigationOptions };
  }
  if (navigationOptions.header !== undefined) {
    return { kind: 'passthrough', navigationOptions };
  }

  const unsupported = hasUnsupportedMaterial3HeaderOptions(navigationOptions);

  if (context.scope === 'root') {
    if (
      navigationOptions.headerShown === false ||
      navigationOptions.headerTransparent === false ||
      material3?.topAppBar === false ||
      unsupported
    ) {
      return { kind: 'passthrough', navigationOptions };
    }

    return {
      kind: 'material3',
      navigationOptions: { ...navigationOptions, headerTransparent: true },
      topAppBar: material3?.topAppBar || undefined,
    };
  }

  const needsNativeHeader =
    navigationOptions.headerShown === false ||
    navigationOptions.headerTransparent === false ||
    unsupported;

  if (material3 === undefined) {
    return needsNativeHeader
      ? { kind: 'native-header', navigationOptions: nativeHeaderFallback(navigationOptions) }
      : { kind: 'passthrough', navigationOptions };
  }

  if (material3.topAppBar === false || needsNativeHeader) {
    return { kind: 'native-header', navigationOptions: nativeHeaderFallback(navigationOptions) };
  }

  return {
    kind: 'material3',
    navigationOptions: { ...navigationOptions, headerTransparent: true },
    topAppBar: material3.topAppBar,
  };
}

/** Map normalized native-stack runtime props to the MaterialTopAppBar public surface. */
export function resolveMaterial3TopAppBarDescriptor(input: {
  routeName: string;
  options: Material3NavigationOptionBag;
  canGoBack: boolean;
  config?: Material3TopAppBarNavigationOptions;
}): Material3TopAppBarDescriptor {
  const headerTitle = input.options.headerTitle;
  const title =
    typeof headerTitle === 'string'
      ? headerTitle
      : typeof input.options.title === 'string'
        ? input.options.title
        : input.routeName;

  const largeTitleEnabled =
    input.options.headerLargeTitleEnabled === true || input.options.headerLargeTitle === true;
  const variant: MaterialTopAppBarVariant =
    input.config?.variant ?? (largeTitleEnabled ? 'large' : 'small');
  const scrollBehavior: MaterialTopAppBarScrollBehavior =
    input.config?.scrollBehavior ?? (variant === 'large' ? 'exitUntilCollapsed' : 'none');
  const canGoBack = input.canGoBack && input.options.headerBackVisible !== false;

  return {
    title,
    variant,
    scrollBehavior,
    navigationIcon: canGoBack ? 'back' : 'none',
    navigationAccessibilityLabel: input.config?.navigationAccessibilityLabel,
    themeMode: input.config?.themeMode,
    dynamicColor: input.config?.dynamicColor,
  };
}
