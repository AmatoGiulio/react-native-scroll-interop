import { Stack } from 'react-native-scroll-interop/router';

export default function HomeStackLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Home',
          headerBackVisible: false,
          material3: {
            topAppBar: {
              variant: 'large',
              scrollBehavior: 'exitUntilCollapsed',
              dynamicColor: true,
            },
          },
        }}
      />
    </Stack>
  );
}
