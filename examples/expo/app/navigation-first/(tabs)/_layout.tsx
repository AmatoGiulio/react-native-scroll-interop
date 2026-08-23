import type { ComponentProps } from 'react';
import { Tabs, useRouter } from 'expo-router';

import { MaterialToolbar } from 'react-native-scroll-interop';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function NavigationFirstTabBar({ state, navigation }: TabBarProps) {
  const router = useRouter();

  const handleTabPress = (name: 'home' | 'details') => {
    const route = state.routes.find((candidate) => candidate.name === name);
    if (!route) return;

    const isFocused = state.routes[state.index]?.key === route.key;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  const selectedRoute = state.routes[state.index]?.name;

  return (
    <MaterialToolbar.Root
      placement="bottom"
      scrollBehavior="exitAlways"
      insets="none"
    >
      <MaterialToolbar.Content>
        <MaterialToolbar.TextButton
          id="home"
          accessibilityLabel="Home"
          selected={selectedRoute === 'home'}
          onPress={() => handleTabPress('home')}
        >
          <MaterialToolbar.Icon resource="demo_ic_home" />
          <MaterialToolbar.Text>Home</MaterialToolbar.Text>
        </MaterialToolbar.TextButton>

        <MaterialToolbar.TextButton
          id="details"
          accessibilityLabel="Details"
          selected={selectedRoute === 'details'}
          onPress={() => handleTabPress('details')}
        >
          <MaterialToolbar.Icon resource="demo_ic_details" />
          <MaterialToolbar.Text>Details</MaterialToolbar.Text>
        </MaterialToolbar.TextButton>
      </MaterialToolbar.Content>

      <MaterialToolbar.Fab
        accessibilityLabel="Create item"
        shape="circle"
        onPress={() => router.push('/navigation-first/create')}
      >
        <MaterialToolbar.Icon resource="demo_ic_add" />
      </MaterialToolbar.Fab>
    </MaterialToolbar.Root>
  );
}

function renderTabBar(props: TabBarProps) {
  return <NavigationFirstTabBar {...props} />;
}

export default function NavigationFirstTabsLayout() {
  return (
    <Tabs
      initialRouteName="home"
      backBehavior="none"
      screenOptions={{ headerShown: false }}
      tabBar={renderTabBar}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="details" options={{ title: 'Details' }} />
    </Tabs>
  );
}
