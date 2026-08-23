import type { ComponentProps } from 'react';
import {
  MaterialToolbar,
  MaterialTopAppBar,
  NativeScrollHost,
} from 'react-native-scroll-interop';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { material3Dark as colors } from '../theme';

const ROWS = Array.from({ length: 80 }, (_, index) => `Standalone row ${index + 1}`);

export default function StandaloneScreen() {
  const hostProps = { style: styles.host } as unknown as ComponentProps<
    typeof NativeScrollHost
  >;

  return (
    <View style={styles.root}>
      <NativeScrollHost {...hostProps}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {ROWS.map((row, index) => (
            <View key={row} style={styles.row}>
              <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={styles.text}>{row}</Text>
            </View>
          ))}
        </ScrollView>
      </NativeScrollHost>

      <MaterialTopAppBar
        title="Standalone"
        variant="large"
        scrollBehavior="exitUntilCollapsed"
      />

      <MaterialToolbar.Root
        placement="bottom"
        insets="none"
        scrollBehavior="exitAlways"
      >
        <MaterialToolbar.Content>
          <MaterialToolbar.TextButton accessibilityLabel="Action">
            <MaterialToolbar.Text>Action</MaterialToolbar.Text>
          </MaterialToolbar.TextButton>
        </MaterialToolbar.Content>
      </MaterialToolbar.Root>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  host: { flex: 1 },
  content: { paddingBottom: 160 },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
  },
  number: { width: 30, color: colors.outline },
  text: { color: colors.onSurface, fontSize: 17 },
});
