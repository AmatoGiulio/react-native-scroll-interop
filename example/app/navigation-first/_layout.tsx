import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  MaterialToolbar,
  MaterialTopAppBar,
} from 'react-native-scroll-interop';

export default function NavigationFirstLayout() {
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerTransparent: true }}>
        <Stack.Screen name="index">
          <Stack.Header asChild>
            <MaterialTopAppBar
              style={{ position: 'relative' }}
              title="Navigation first"
              variant="large"
              scrollBehavior="exitUntilCollapsed"
            />
          </Stack.Header>
        </Stack.Screen>

        <Stack.Screen name="details">
          <Stack.Header asChild>
            <MaterialTopAppBar
              style={{ position: 'relative' }}
              title="Details"
              variant="medium"
              scrollBehavior="enterAlways"
              navigationIcon="back"
              navigationAccessibilityLabel="Back"
              onNavigationPress={() => router.back()}
            />
          </Stack.Header>
        </Stack.Screen>
      </Stack>

      <MaterialToolbar.Root
        placement="bottom"
        scrollBehavior="exitAlways"
        insets="safe"
      >
        <MaterialToolbar.Content>
          <MaterialToolbar.TextButton
            id="home"
            accessibilityLabel="Home"
            onPress={() => router.replace('/navigation-first')}
          >
            <MaterialToolbar.Text>Home</MaterialToolbar.Text>
          </MaterialToolbar.TextButton>

          <MaterialToolbar.TextButton
            id="details"
            accessibilityLabel="Details"
            onPress={() => router.push('/navigation-first/details')}
          >
            <MaterialToolbar.Text>Details</MaterialToolbar.Text>
          </MaterialToolbar.TextButton>
        </MaterialToolbar.Content>

        <MaterialToolbar.Fab
          accessibilityLabel="Open details"
          onPress={() => router.push('/navigation-first/details')}
        >
          <MaterialToolbar.Icon fallback="initial" />
        </MaterialToolbar.Fab>
      </MaterialToolbar.Root>
    </View>
  );
}
