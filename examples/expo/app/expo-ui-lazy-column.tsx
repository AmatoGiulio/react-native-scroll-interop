import { Host } from '@expo/ui';
import { Card, Column, LazyColumn, Surface, Text } from '@expo/ui/jetpack-compose';
import {
  fillMaxSize,
  fillMaxWidth,
  height,
  paddingAll,
} from '@expo/ui/jetpack-compose/modifiers';
import type { ComponentProps } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { MaterialToolbar, MaterialTopAppBar, NativeScrollHost } from 'react-native-scroll-interop';

const ROWS = Array.from({ length: 32 }, (_, index) => `Item ${String(index + 1).padStart(2, '0')}`);

export default function ExpoUiLazyColumnPoc() {
  const router = useRouter();
  const hostProps = { style: styles.host } as unknown as ComponentProps<typeof NativeScrollHost>;
  const composeHostProps = {
    style: styles.host,
  } as unknown as ComponentProps<typeof Host>;

  return (
    <View style={styles.root}>
      <NativeScrollHost {...hostProps}>
        <Host {...composeHostProps}>
          <Surface modifiers={[fillMaxSize()]}>
            <LazyColumn
              contentPadding={{ start: 16, top: 16, end: 16, bottom: 132 }}
              verticalArrangement={{ spacedBy: 8 }}
              modifiers={[fillMaxSize()]}
            >
              {ROWS.map((row) => (
                <Card
                  key={row}
                  modifiers={[fillMaxWidth(), height(76)]}
                >
                  <Column
                    verticalArrangement="center"
                    modifiers={[fillMaxSize(), paddingAll(18)]}
                  >
                    <Text style={{ typography: 'titleMedium' }}>
                      {row}
                    </Text>
                    <Text style={{ typography: 'bodySmall' }}>
                      Native Compose
                    </Text>
                  </Column>
                </Card>
              ))}
            </LazyColumn>
          </Surface>
        </Host>
      </NativeScrollHost>
      <MaterialTopAppBar
        title="Expo UI"
        variant="large"
        scrollBehavior="exitUntilCollapsed"
        dynamicColor
        themeMode="system"
      />
      <MaterialToolbar.Root
        placement="bottom"
        insets="none"
        scrollBehavior="exitAlways"
        dynamicColor
        themeMode="system"
      >
        <MaterialToolbar.Content>
          <MaterialToolbar.TextButton accessibilityLabel="LazyColumn" selected>
            <MaterialToolbar.Text>LazyColumn</MaterialToolbar.Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  host: { flex: 1 },
});
