import { forwardRef, useImperativeHandle } from 'react';

import {
  MaterialToolbarContent,
  MaterialToolbarFab,
  MaterialToolbarIcon,
  MaterialToolbarIconButton,
  MaterialToolbarLeadingContent,
  MaterialToolbarText,
  MaterialToolbarTextButton,
  MaterialToolbarTrailingContent,
} from './MaterialToolbar.markers';
import type { MaterialToolbarRef, MaterialToolbarRootProps } from './MaterialToolbar.types';

const noopAsync = async () => undefined;

const MaterialToolbarRoot = forwardRef<MaterialToolbarRef, MaterialToolbarRootProps>(
  function MaterialToolbarRoot(_props, ref) {
    useImperativeHandle(
      ref,
      () => ({
        show: noopAsync,
        hide: noopAsync,
        expand: noopAsync,
        collapse: noopAsync,
      }),
      []
    );

    return null;
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
