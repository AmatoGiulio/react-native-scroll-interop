import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useDemoColors } from '../../../../theme/colors';

const ROWS = Array.from({ length: 32 }, (_, index) => `Item ${String(index + 1).padStart(2, '0')}`);

export default function NavigationFirstHome() {
  const router = useRouter();
  const colors = useDemoColors();

  const openItem = (row: string) => {
    router.push({
      pathname: '/navigation-first/detail-item',
      params: { row, source: 'Home' },
    });
  };

  return (
    <ScrollView
      style={[styles.host, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open native chrome details"
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: pressed ? colors.pressed : colors.surface },
        ]}
        onPress={() => openItem('Native chrome')}
      >
        <Text style={[styles.cardEyebrow, { color: colors.accent }]}>REACT NATIVE</Text>
        <Text style={[styles.cardTitle, { color: colors.text }]}>ScrollView, native chrome</Text>
        <Text style={[styles.cardBody, { color: colors.muted }]}>One continuous scroll.</Text>
      </Pressable>

      {ROWS.map((row, index) => (
        <Pressable
          key={row}
          accessibilityRole="button"
          accessibilityLabel={`Open details for ${row}`}
          style={({ pressed }) => [
            styles.row,
            //pressed && { backgroundColor: colors.pressed },
          ]}
          onPress={() => openItem(row)}
        >
          <Text style={[styles.number, { color: colors.muted }]}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={[styles.text, { color: colors.text }]}>{row}</Text>
          <Text style={[styles.chevron, { color: colors.muted }]} accessibilityElementsHidden>
            ›
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 160 },
  card: {
    marginVertical: 12,
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
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  number: { width: 30, fontSize: 13, fontVariant: ['tabular-nums'] },
  text: { flex: 1, fontSize: 17 },
  chevron: { fontSize: 28, lineHeight: 30 },
});
