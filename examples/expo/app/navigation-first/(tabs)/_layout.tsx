import type { ComponentProps } from 'react';
import { Tabs } from 'expo-router';

import { MaterialToolbar } from 'react-native-scroll-interop';

import { material3Dynamic as colors } from '../../../theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function NavigationFirstTabBar() {
  return (
    <MaterialToolbar.Root
      placement="bottom"
      scrollBehavior="exitAlways"
      insets="safe"
      edgeOffset={8}
      contentPadding={{ horizontal: 4, vertical: 4 }}
      dynamicColor
      colors={{
        fabContainer: colors.surfaceContainerHigh,
        fabContent: colors.onSurface,
      }}
    >
      <MaterialToolbar.Content>
        <MaterialToolbar.TextButton
          id="photos"
          accessibilityLabel="Photos"
          selected={false}
          onPress={() => {}}
        >
          <MaterialToolbar.Text>Photos</MaterialToolbar.Text>
        </MaterialToolbar.TextButton>

        <MaterialToolbar.TextButton
          id="spatial"
          accessibilityLabel="Spatial"
          selected={false}
          onPress={() => {}}
        >
          <MaterialToolbar.Text>Spatial</MaterialToolbar.Text>
        </MaterialToolbar.TextButton>

        <MaterialToolbar.TextButton
          id="collections"
          accessibilityLabel="Collections"
          selected
          onPress={() => {}}
        >
          <MaterialToolbar.Icon resource="demo_ic_collections" size={18} />
          <MaterialToolbar.Text>Collections</MaterialToolbar.Text>
        </MaterialToolbar.TextButton>

        <MaterialToolbar.TextButton
          id="create"
          accessibilityLabel="Create"
          selected={false}
          onPress={() => {}}
        >
          <MaterialToolbar.Text>Create</MaterialToolbar.Text>
        </MaterialToolbar.TextButton>
      </MaterialToolbar.Content>

      <MaterialToolbar.Fab accessibilityLabel="Search" shape="circle" onPress={() => {}}>
        <MaterialToolbar.Icon resource="demo_ic_search" />
      </MaterialToolbar.Fab>
    </MaterialToolbar.Root>
  );
}

function renderTabBar(_props: TabBarProps) {
  return <NavigationFirstTabBar />;
}

export default function NavigationFirstTabsLayout() {
  return (
    <Tabs
      initialRouteName="home"
      backBehavior="none"
      screenOptions={{ headerShown: false }}
      tabBar={renderTabBar}
    >
      <Tabs.Screen name="home" options={{ title: 'Collections' }} />
      <Tabs.Screen name="details" options={{ title: 'Details' }} />
    </Tabs>
  );
}
