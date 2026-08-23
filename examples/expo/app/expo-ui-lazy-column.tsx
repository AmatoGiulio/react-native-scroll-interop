import { Column, Host, LazyColumn, Text } from '@expo/ui/jetpack-compose';
import type { ExpoModifier } from '@expo/ui/jetpack-compose/modifiers';
import {
  fillMaxSize,
  fillMaxWidth,
  height,
  paddingAll,
} from '@expo/ui/jetpack-compose/modifiers';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { MaterialToolbar, NativeScrollHost } from 'react-native-scroll-interop';

const ROWS = Array.from({ length: 80 }, (_, index) => `Compose row ${index + 1}`);
const nestedScrollInterop: ExpoModifier = { $type: 'nestedScrollInterop' };

export default function ExpoUiLazyColumnPoc() {
  const hostProps = { style: styles.host } as unknown as ComponentProps<typeof NativeScrollHost>;

  return (
    <View style={styles.root}>
      <NativeScrollHost {...hostProps}>
        <Host style={styles.host}>
          <LazyColumn
            contentPadding={{ top: 20, bottom: 140 }}
            verticalArrangement={{ spacedBy: 4 }}
            modifiers={[fillMaxSize(), nestedScrollInterop]}
          >
            {ROWS.map((row) => (
              <Column
                key={row}
                verticalArrangement="center"
                modifiers={[fillMaxWidth(), height(72), paddingAll(20)]}
              >
                <Text style={{ typography: 'titleMedium' }}>{row}</Text>
                <Text style={{ typography: 'bodySmall' }}>
                  Expo UI LazyColumn · native Compose scroll
                </Text>
              </Column>
            ))}
          </LazyColumn>
        </Host>
      </NativeScrollHost>

      <MaterialToolbar.Root placement="bottom" insets="none" scrollBehavior="exitAlways">
        <MaterialToolbar.Content>
          <MaterialToolbar.TextButton accessibilityLabel="LazyColumn POC" selected>
            <MaterialToolbar.Text>LazyColumn</MaterialToolbar.Text>
          </MaterialToolbar.TextButton>
          <MaterialToolbar.TextButton accessibilityLabel="Expo UI">
            <MaterialToolbar.Text>Expo UI</MaterialToolbar.Text>
          </MaterialToolbar.TextButton>
        </MaterialToolbar.Content>
      </MaterialToolbar.Root>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101318' },
  host: { flex: 1 },
});
