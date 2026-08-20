import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { Image, StyleSheet } from 'react-native';

import ExpoMaterialToolbarNativeView, {
  type NativeToolbarAction,
} from './ExpoMaterialToolbarNativeView';
import {
  flattenElements,
  getMarker,
  MATERIAL_TOOLBAR_MARKER,
  MaterialToolbarContent,
  MaterialToolbarFab,
  MaterialToolbarIcon,
  MaterialToolbarIconButton,
  MaterialToolbarLeadingContent,
  MaterialToolbarText,
  MaterialToolbarTextButton,
  MaterialToolbarTrailingContent,
} from './MaterialToolbar.markers';
import type {
  MaterialToolbarButtonCommonProps,
  MaterialToolbarFabProps,
  MaterialToolbarIconProps,
  MaterialToolbarRef,
  MaterialToolbarRootProps,
  MaterialToolbarTextProps,
} from './MaterialToolbar.types';

type HandlerMap = Map<string, (() => void) | undefined>;

type CompiledModel = {
  content: NativeToolbarAction[];
  leadingContent: NativeToolbarAction[];
  trailingContent: NativeToolbarAction[];
  handlers: HandlerMap;
  fab?: {
    accessibilityLabel?: string;
    iconUri?: string;
    iconTintable: boolean;
    iconSize: number;
    iconFallback: 'initial' | 'none';
    shape: 'default' | 'circle';
    onPress?: () => void;
  };
};

function resolveImageSource(source?: MaterialToolbarIconProps['source']): string | undefined {
  if (source == null) {
    return undefined;
  }
  return Image.resolveAssetSource(source)?.uri;
}

function resolveIconUri(
  source: MaterialToolbarIconProps['source'] | undefined,
  resource: string | undefined
): string | undefined {
  return resource?.trim() || resolveImageSource(source);
}

function compileActions(
  children: React.ReactNode,
  group: string,
  handlers: HandlerMap
): NativeToolbarAction[] {
  const result: NativeToolbarAction[] = [];

  flattenElements(children).forEach((element, index) => {
    const marker = getMarker(element);
    if (
      marker !== MATERIAL_TOOLBAR_MARKER.iconButton &&
      marker !== MATERIAL_TOOLBAR_MARKER.textButton
    ) {
      return;
    }

    const rawProps = element.props as MaterialToolbarButtonCommonProps;
    const itemChildren = flattenElements(rawProps.children);
    const iconElement = itemChildren.find(
      (child) => getMarker(child) === MATERIAL_TOOLBAR_MARKER.icon
    );
    const textElement = itemChildren.find(
      (child) => getMarker(child) === MATERIAL_TOOLBAR_MARKER.text
    );

    const iconProps = iconElement?.props as MaterialToolbarIconProps | undefined;
    const textProps = textElement?.props as MaterialToolbarTextProps | undefined;
    const id = rawProps.id?.trim() || `${group}:${index}`;
    const label = textProps?.children ?? '';
    const presentation: NativeToolbarAction['presentation'] =
      marker === MATERIAL_TOOLBAR_MARKER.textButton ? 'text' : 'icon';

    result.push({
      id,
      presentation,
      label,
      enabled: rawProps.enabled ?? true,
      accessibilityLabel: rawProps.accessibilityLabel ?? (label || undefined),
      iconPresent: iconProps != null,
      iconUri: iconProps ? resolveIconUri(iconProps.source, iconProps.resource) : undefined,
      iconTintable: iconProps?.tint !== 'none',
      iconSize: iconProps?.size ?? (presentation === 'icon' ? 24 : 18),
      iconFallback: iconProps?.fallback ?? 'none',
      selected: rawProps.selected ?? false,
    });

    handlers.set(id, rawProps.onPress);
  });

  return result;
}

function compileModel(children: MaterialToolbarRootProps['children']): CompiledModel {
  const rootChildren = flattenElements(children);
  const contentElement = rootChildren.find(
    (element) => getMarker(element) === MATERIAL_TOOLBAR_MARKER.content
  );
  const leadingElement = rootChildren.find(
    (element) => getMarker(element) === MATERIAL_TOOLBAR_MARKER.leadingContent
  );
  const trailingElement = rootChildren.find(
    (element) => getMarker(element) === MATERIAL_TOOLBAR_MARKER.trailingContent
  );
  const fabElement = rootChildren.find(
    (element) => getMarker(element) === MATERIAL_TOOLBAR_MARKER.fab
  );

  const handlers: HandlerMap = new Map();
  const content = compileActions(
    (contentElement?.props as { children?: React.ReactNode } | undefined)?.children,
    'content',
    handlers
  );
  const leadingContent = compileActions(
    (leadingElement?.props as { children?: React.ReactNode } | undefined)?.children,
    'leading',
    handlers
  );
  const trailingContent = compileActions(
    (trailingElement?.props as { children?: React.ReactNode } | undefined)?.children,
    'trailing',
    handlers
  );

  let fab: CompiledModel['fab'];
  if (fabElement) {
    const fabProps = fabElement.props as MaterialToolbarFabProps;
    const iconElement = flattenElements(fabProps.children).find(
      (element) => getMarker(element) === MATERIAL_TOOLBAR_MARKER.icon
    );
    const iconProps = iconElement?.props as MaterialToolbarIconProps | undefined;

    fab = {
      accessibilityLabel: fabProps.accessibilityLabel,
      iconUri: iconProps ? resolveIconUri(iconProps.source, iconProps.resource) : undefined,
      iconTintable: iconProps?.tint !== 'none',
      iconSize: iconProps?.size ?? 24,
      iconFallback: iconProps?.fallback ?? (iconProps ? 'none' : 'initial'),
      shape: fabProps.shape ?? 'default',
      onPress: fabProps.onPress,
    };
  }

  return {
    content,
    leadingContent,
    trailingContent,
    handlers,
    fab,
  };
}

function resolvePadding(padding: MaterialToolbarRootProps['contentPadding']) {
  if (typeof padding === 'number') {
    return {
      start: padding,
      top: padding,
      end: padding,
      bottom: padding,
    };
  }

  if (!padding) {
    return {};
  }

  return {
    start: padding.start ?? padding.horizontal,
    top: padding.top ?? padding.vertical,
    end: padding.end ?? padding.horizontal,
    bottom: padding.bottom ?? padding.vertical,
  };
}

const MaterialToolbarRoot = forwardRef<MaterialToolbarRef, MaterialToolbarRootProps>(
  function MaterialToolbarRoot(
    {
      children,
      expanded = true,
      visible = true,
      orientation = 'horizontal',
      scrollBehavior = 'none',
      scrollExitDirection,
      variant = 'standard',
      themeMode = 'system',
      dynamicColor = false,
      imeBehavior = 'none',
      placement = 'bottom',
      alignment,
      insets = 'safe',
      edgeOffset,
      contentPadding,
      expandedShadowElevation,
      collapsedShadowElevation,
      floatingActionButtonPosition,
      colors,
      style,
    },
    forwardedRef
  ) {
    const model = useMemo(() => compileModel(children), [children]);
    const padding = useMemo(() => resolvePadding(contentPadding), [contentPadding]);
    const [nativeVisible, setNativeVisible] = useState(visible);
    const [nativeExpanded, setNativeExpanded] = useState(expanded);

    useEffect(() => {
      setNativeVisible(visible);
    }, [visible]);

    useEffect(() => {
      setNativeExpanded(expanded);
    }, [expanded]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        async show() {
          setNativeVisible(true);
        },
        async hide() {
          setNativeVisible(false);
        },
        async expand() {
          setNativeExpanded(true);
        },
        async collapse() {
          setNativeExpanded(false);
        },
      }),
      []
    );

    const resolvedFabPosition =
      floatingActionButtonPosition ?? (orientation === 'vertical' ? 'bottom' : 'end');
    const resolvedAlignment =
      alignment ??
      (placement === 'top'
        ? 'topCenter'
        : placement === 'center'
          ? 'center'
          : 'bottomCenter');

    const handleActionPress = useCallback(
      ({ nativeEvent }: { nativeEvent: { id: string } }) => {
        model.handlers.get(nativeEvent.id)?.();
      },
      [model.handlers]
    );

    const handleFabPress = useCallback(() => {
      model.fab?.onPress?.();
    }, [model.fab]);

    return (
      <ExpoMaterialToolbarNativeView
        style={style ?? StyleSheet.absoluteFill}
        pointerEvents="box-none"
        content={model.content}
        leadingContent={model.leadingContent}
        trailingContent={model.trailingContent}
        visible={nativeVisible}
        expanded={nativeExpanded}
        scrollBehavior={scrollBehavior}
        scrollExitDirection={scrollExitDirection ?? 'auto'}
        orientation={orientation}
        variant={variant}
        fabPresent={model.fab != null}
        fabPosition={resolvedFabPosition}
        fabIconUri={model.fab?.iconUri}
        fabIconTintable={model.fab?.iconTintable ?? true}
        fabIconSize={model.fab?.iconSize ?? 24}
        fabIconFallback={model.fab?.iconFallback ?? 'none'}
        fabAccessibilityLabel={model.fab?.accessibilityLabel}
        fabShape={model.fab?.shape ?? 'default'}
        themeMode={themeMode}
        dynamicColor={dynamicColor}
        imeBehavior={imeBehavior}
        alignment={resolvedAlignment}
        insets={insets}
        edgeOffset={edgeOffset}
        contentPaddingStart={padding.start}
        contentPaddingTop={padding.top}
        contentPaddingEnd={padding.end}
        contentPaddingBottom={padding.bottom}
        expandedShadowElevation={expandedShadowElevation}
        collapsedShadowElevation={collapsedShadowElevation}
        toolbarContainerColor={colors?.toolbarContainer}
        toolbarContentColor={colors?.toolbarContent}
        fabContainerColor={colors?.fabContainer}
        fabContentColor={colors?.fabContent}
        selectedContainerColor={colors?.selectedContainer}
        selectedContentColor={colors?.selectedContent}
        unselectedContentColor={colors?.unselectedContent}
        onActionPress={handleActionPress}
        onFabPress={handleFabPress}
      />
    );
  }
);

export const MaterialToolbar = {
  Root: MaterialToolbarRoot,
  Content: MaterialToolbarContent,
  LeadingContent: MaterialToolbarLeadingContent,
  TrailingContent: MaterialToolbarTrailingContent,
  IconButton: MaterialToolbarIconButton,
  TextButton: MaterialToolbarTextButton,
  Icon: MaterialToolbarIcon,
  Text: MaterialToolbarText,
  Fab: MaterialToolbarFab,
} as const;
