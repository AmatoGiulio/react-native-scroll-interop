import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { MaterialToolbar } from 'react-native-scroll-interop';
import { Stack } from 'react-native-scroll-interop/router';

export default function NavigationFirstLayout() {
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: 'Navigation first',
            headerLargeTitle: true,
          }}
        />

        <Stack.Screen
          name="details"
          options={{
            title: 'Details',
            material3: {
              topAppBar: {
                variant: 'medium',
                scrollBehavior: 'enterAlways',
                navigationAccessibilityLabel: 'Back',
              },
            },
          }}
        />
      </Stack>

      <MaterialToolbar.Root
        placement="bottom"
        scrollBehavior="exitAlways"
        insets="none"
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
