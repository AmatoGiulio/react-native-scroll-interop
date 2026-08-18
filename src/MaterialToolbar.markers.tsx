import type { FC, ReactElement, ReactNode } from 'react';
import { Fragment } from 'react';

import type {
  MaterialToolbarContentProps,
  MaterialToolbarFabProps,
  MaterialToolbarIconButtonProps,
  MaterialToolbarIconProps,
  MaterialToolbarLeadingContentProps,
  MaterialToolbarTextButtonProps,
  MaterialToolbarTextProps,
  MaterialToolbarTrailingContentProps,
} from './MaterialToolbar.types';

export const MATERIAL_TOOLBAR_MARKER = {
  content: Symbol('MaterialToolbar.Content'),
  leadingContent: Symbol('MaterialToolbar.LeadingContent'),
  trailingContent: Symbol('MaterialToolbar.TrailingContent'),
  iconButton: Symbol('MaterialToolbar.IconButton'),
  textButton: Symbol('MaterialToolbar.TextButton'),
  icon: Symbol('MaterialToolbar.Icon'),
  text: Symbol('MaterialToolbar.Text'),
  fab: Symbol('MaterialToolbar.Fab'),
} as const;

type MarkerKind = keyof typeof MATERIAL_TOOLBAR_MARKER;

type MarkerComponent<P> = FC<P> & {
  __materialToolbarMarker: (typeof MATERIAL_TOOLBAR_MARKER)[MarkerKind];
};

function createMarker<P>(kind: MarkerKind): MarkerComponent<P> {
  const Component: MarkerComponent<P> = Object.assign(
    () => null,
    {
      __materialToolbarMarker: MATERIAL_TOOLBAR_MARKER[kind],
    }
  );
  Component.displayName = `MaterialToolbar.${kind[0].toUpperCase()}${kind.slice(1)}`;
  return Component;
}

export const MaterialToolbarContent = createMarker<MaterialToolbarContentProps>('content');
export const MaterialToolbarLeadingContent =
  createMarker<MaterialToolbarLeadingContentProps>('leadingContent');
export const MaterialToolbarTrailingContent =
  createMarker<MaterialToolbarTrailingContentProps>('trailingContent');
export const MaterialToolbarIconButton =
  createMarker<MaterialToolbarIconButtonProps>('iconButton');
export const MaterialToolbarTextButton =
  createMarker<MaterialToolbarTextButtonProps>('textButton');
export const MaterialToolbarIcon = createMarker<MaterialToolbarIconProps>('icon');
export const MaterialToolbarText = createMarker<MaterialToolbarTextProps>('text');
export const MaterialToolbarFab = createMarker<MaterialToolbarFabProps>('fab');

export function getMarker(element: ReactElement): symbol | undefined {
  return (element.type as { __materialToolbarMarker?: symbol }).__materialToolbarMarker;
}

export function flattenElements(children: ReactNode): ReactElement[] {
  const result: ReactElement[] = [];

  const visit = (node: ReactNode) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (node == null || typeof node === 'boolean') {
      return;
    }

    if (typeof node !== 'object' || !('type' in node)) {
      return;
    }

    const element = node as ReactElement;

    if (element.type === Fragment) {
      visit((element.props as { children?: ReactNode }).children);
      return;
    }

    result.push(element);
  };

  visit(children);
  return result;
}
