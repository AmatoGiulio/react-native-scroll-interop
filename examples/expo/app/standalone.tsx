import type { ComponentProps } from 'react';
import {
  MaterialToolbar,
  MaterialTopAppBar,
  NativeScrollHost,
} from 'react-native-scroll-interop';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useDemoColors } from '../theme/colors';

const ROWS = Array.from({ length: 32 }, (_, index) => `Item ${String(index + 1).padStart(2, '0')}`);

export default function StandaloneScreen() {
  const colors = useDemoColors();
  const hostProps = { style: styles.host } as unknown as ComponentProps<
    typeof NativeScrollHost
  >;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <NativeScrollHost {...hostProps}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardEyebrow, { color: colors.accent }]}>REACT NATIVE</Text>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Standalone host</Text>
            <Text style={[styles.cardBody, { color: colors.muted }]}>Native chrome follows a standard ScrollView.</Text>
          </View>

          {ROWS.map((row, index) => (
            <View key={row} style={styles.row}>
              <Text style={[styles.number, { color: colors.muted }]}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={[styles.text, { color: colors.text }]}>{row}</Text>
            </View>
          ))}
        </ScrollView>
      </NativeScrollHost>

      <MaterialTopAppBar
        title="React Native"
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
          <MaterialToolbar.TextButton accessibilityLabel="ScrollView" selected>
            <MaterialToolbar.Text>ScrollView</MaterialToolbar.Text>
          </MaterialToolbar.TextButton>
        </MaterialToolbar.Content>
      </MaterialToolbar.Root>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  host: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 160 },
  card: {
    marginBottom: 12,
    padding: 20,
    borderRadius: 24,
    borderCurve: 'continuous',
    gap: 6,
  },
  cardEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  cardTitle: { fontSize: 21, fontWeight: '600' },
  cardBody: { maxWidth: 300, fontSize: 15, lineHeight: 21 },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 12,
  },
  number: { width: 30, fontSize: 13, fontVariant: ['tabular-nums'] },
  text: { fontSize: 17 },
});
