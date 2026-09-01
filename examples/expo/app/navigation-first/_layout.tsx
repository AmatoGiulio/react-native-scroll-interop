import { Stack } from 'react-native-scroll-interop/router';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function NavigationFirstLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="detail-item"
        options={{
          title: 'Details',
          material3: {
            topAppBar: {
              variant: 'small',
              scrollBehavior: 'enterAlways',
              navigationAccessibilityLabel: 'Back',
              themeMode: 'system',
              dynamicColor: true,
            },
          },
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          title: 'New item',
          material3: {
            topAppBar: {
              variant: 'small',
              scrollBehavior: 'enterAlways',
              navigationAccessibilityLabel: 'Back',
              themeMode: 'system',
              dynamicColor: true,
            },
          },
        }}
      />
    </Stack>
  );
}
