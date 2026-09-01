import { Stack } from 'react-native-scroll-interop/router';

export default function HomeStackLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Scroll interop',
          headerBackVisible: false,
          material3: {
            topAppBar: {
              variant: 'large',
              scrollBehavior: 'exitUntilCollapsed',
              themeMode: 'system',
              dynamicColor: true,
            },
          },
        }}
      />
    </Stack>
  );
}
