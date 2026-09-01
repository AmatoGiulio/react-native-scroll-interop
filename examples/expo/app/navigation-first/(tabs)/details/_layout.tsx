import { Stack } from 'react-native-scroll-interop/router';

export default function DetailsStackLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Architecture',
          headerBackVisible: false,
          material3: {
            topAppBar: {
              variant: 'small',
              scrollBehavior: 'pinned',
              themeMode: 'system',
              dynamicColor: true,
            },
          },
        }}
      />
    </Stack>
  );
}
