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
        <Stack.Screen
          name="index"
          options={{
            header: () => (
              <MaterialTopAppBar
                title="Navigation first"
                variant="large"
                scrollBehavior="exitUntilCollapsed"
              />
            ),
          }}
        />

        <Stack.Screen
          name="details"
          options={{
            header: ({ navigation, back }) => (
              <MaterialTopAppBar
                title="Details"
                variant="medium"
                scrollBehavior="enterAlways"
                navigationIcon={back ? 'back' : 'none'}
                navigationAccessibilityLabel="Back"
                onNavigationPress={back ? () => navigation.goBack() : undefined}
              />
            ),
          }}
        />
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
