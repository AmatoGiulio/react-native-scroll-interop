import type { ReactNode } from 'react';
import type {
  ColorValue,
  ImageSourcePropType,
  StyleProp,
  ViewStyle,
} from 'react-native';

export type MaterialToolbarOrientation = 'horizontal' | 'vertical';
export type MaterialToolbarVariant = 'standard' | 'vibrant';
export type MaterialToolbarImeBehavior = 'none' | 'hide';
export type MaterialToolbarThemeMode = 'system' | 'light' | 'dark';
export type MaterialToolbarInsets = 'none' | 'safe';
export type MaterialToolbarPlacement = 'top' | 'center' | 'bottom';
export type MaterialToolbarScrollBehavior = 'none' | 'exitAlways';
export type MaterialToolbarScrollExitDirection = 'top' | 'bottom' | 'start' | 'end';
export type MaterialToolbarAlignment =
  | 'topStart'
  | 'topCenter'
  | 'topEnd'
  | 'centerStart'
  | 'center'
  | 'centerEnd'
  | 'bottomStart'
  | 'bottomCenter'
  | 'bottomEnd';

/**
 * Position of the attached FAB. Horizontal toolbars accept start/end;
 * vertical toolbars accept top/bottom.
 */
export type MaterialToolbarFabPosition = 'start' | 'end' | 'top' | 'bottom';
export type MaterialToolbarFabShape = 'default' | 'circle';

export type MaterialToolbarColors = {
  toolbarContainer?: ColorValue;
  toolbarContent?: ColorValue;
  fabContainer?: ColorValue;
  fabContent?: ColorValue;

  /** Bridge navigation-state extension. Defaults to Material secondaryContainer. */
  selectedContainer?: ColorValue;
  /** Bridge navigation-state extension. Defaults to Material onSecondaryContainer. */
  selectedContent?: ColorValue;
  /** Bridge navigation-state extension. Defaults to toolbarContent. */
  unselectedContent?: ColorValue;
};

export type MaterialToolbarRootProps = {
  children?: ReactNode;

  /** Mirrors Horizontal/VerticalFloatingToolbar.expanded. Default: true. */
  expanded?: boolean;
  /** Bridge-level animated visibility for the complete native toolbar. Default: true. */
  visible?: boolean;
  /** HorizontalFloatingToolbar or VerticalFloatingToolbar. Default: horizontal. */
  orientation?: MaterialToolbarOrientation;
  /**
   * Native Material3 FloatingToolbar scroll behavior driven by the Android nested-scroll
   * transaction, without adding a JS onScroll handler. Default: none.
   */
  scrollBehavior?: MaterialToolbarScrollBehavior;
  /** Mirrors FloatingToolbarExitDirection. Omit to infer from host alignment/placement. */
  scrollExitDirection?: MaterialToolbarScrollExitDirection;
  /** Standard or vibrant Material floating-toolbar color treatment. */
  variant?: MaterialToolbarVariant;

  /** Native fallback Material color scheme. Default: system. */
  themeMode?: MaterialToolbarThemeMode;
  /** Android 12+ Material You dynamic color. */
  dynamicColor?: boolean;
  /** Hide the complete toolbar while the soft keyboard is visible. */
  imeBehavior?: MaterialToolbarImeBehavior;

  /**
   * Convenience host placement. Maps to topCenter / center / bottomCenter.
   * `alignment` takes precedence when both are provided. Default: bottom.
   */
  placement?: MaterialToolbarPlacement;
  /** Advanced alignment of the Compose toolbar inside the Expo native view. */
  alignment?: MaterialToolbarAlignment;
  /** Applies WindowInsets.safeDrawing to the toolbar host. */
  insets?: MaterialToolbarInsets;
  /** Extra distance from the aligned edge(s), in dp. Omitted = Material ScreenOffset. */
  edgeOffset?: number;

  /** Mirrors FloatingToolbar content padding. Number = all sides, object = per side, in dp. */
  contentPadding?: number | {
    horizontal?: number;
    vertical?: number;
    start?: number;
    top?: number;
    end?: number;
    bottom?: number;
  };
  /** Optional expanded shadow elevation override in dp; omitted = Material default. */
  expandedShadowElevation?: number;
  /** Optional collapsed shadow elevation override in dp; omitted = Material default. */
  collapsedShadowElevation?: number;

  /** Position for an attached FAB. Defaults to end (horizontal) / bottom (vertical). */
  floatingActionButtonPosition?: MaterialToolbarFabPosition;

  colors?: MaterialToolbarColors;
  style?: StyleProp<ViewStyle>;
};

export type MaterialToolbarContentProps = {
  children?: ReactNode;
};

export type MaterialToolbarLeadingContentProps = {
  children?: ReactNode;
};

export type MaterialToolbarTrailingContentProps = {
  children?: ReactNode;
};

export type MaterialToolbarButtonCommonProps = {
  children?: ReactNode;
  id?: string;
  enabled?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;

  /**
   * Bridge-level visual selection state for navigation-style toolbar actions.
   * FloatingToolbar itself has no selected-item API; this does not add Role.Tab.
   */
  selected?: boolean;
};

/** Maps directly to a Material3 IconButton. */
export type MaterialToolbarIconButtonProps = MaterialToolbarButtonCommonProps;

/** Maps directly to a Material3 TextButton. */
export type MaterialToolbarTextButtonProps = MaterialToolbarButtonCommonProps;

export type MaterialToolbarIconProps = {
  /** React Native image source (bundled image or URI). */
  source?: ImageSourcePropType;
  /** Android drawable/mipmap resource name, e.g. ic_home. */
  resource?: string;
  tint?: 'content' | 'none';
  size?: number;
  fallback?: 'initial' | 'none';
};

/** Text rendered inside a TextButton. */
export type MaterialToolbarTextProps = {
  children: string;
};

export type MaterialToolbarFabProps = {
  children?: ReactNode;
  accessibilityLabel?: string;
  onPress?: () => void;
  /** Maps to the Compose FAB shape parameter. Default keeps Material3's native shape. */
  shape?: MaterialToolbarFabShape;
};

export type MaterialToolbarRef = {
  show(): Promise<void>;
  hide(): Promise<void>;
  expand(): Promise<void>;
  collapse(): Promise<void>;
};
