import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useDemoColors } from '../../theme/colors';

const ROWS = Array.from({ length: 24 }, (_, index) => `Detail ${String(index + 1).padStart(2, '0')}`);

export default function NavigationFirstDetailItem() {
  const { row, source } = useLocalSearchParams<{ row?: string; source?: string }>();
  const colors = useDemoColors();

  return (
    <ScrollView
      style={[styles.host, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>{source ?? 'ITEM'}</Text>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{row ?? 'Selected item'}</Text>
        <Text style={[styles.cardBody, { color: colors.muted }]}>Parent stack · native back · toolbar hidden</Text>
      </View>

      {ROWS.map((item, index) => (
        <View key={item} style={styles.row}>
          <Text style={[styles.number, { color: colors.muted }]}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={[styles.text, { color: colors.text }]}>{item}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    marginBottom: 12,
    padding: 20,
    borderRadius: 24,
    borderCurve: 'continuous',
    gap: 6,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardTitle: { fontSize: 24, fontWeight: '600' },
  cardBody: { fontSize: 15, lineHeight: 21 },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  number: { width: 30, fontSize: 13, fontVariant: ['tabular-nums'] },
  text: { fontSize: 17 },
});
