import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useDemoColors } from '../../../../theme/colors';

const SECTIONS = [
  ['Ownership', 'One source drives every native consumer.'],
  ['Navigation', 'Each tab preserves its own state.'],
  ['Motion', 'Chrome follows the native transaction.'],
  ['Material 3', 'Top app bars, toolbars and FABs.'],
  ['Lifecycle', 'State survives screen transitions.'],
  ['Conservation', 'Every pixel is consumed once.'],
  ['React Native', 'ScrollView support across versions.'],
  ['Expo UI', 'Compose participates in the same contract.'],
] as const;

export default function NavigationFirstDetails() {
  const router = useRouter();
  const colors = useDemoColors();

  return (
    <ScrollView
      style={[styles.host, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.cardEyebrow, { color: colors.accent }]}>UNDER THE HOOD</Text>
        <Text style={[styles.cardTitle, { color: colors.text }]}>One transaction</Text>
        <Text style={[styles.cardBody, { color: colors.muted }]}>React Native and Compose share the same native scroll contract.</Text>
      </View>

      {SECTIONS.map(([title, description], index) => (
        <Pressable
          key={title}
          accessibilityRole="button"
          accessibilityLabel={`Open ${title}`}
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: colors.pressed },
          ]}
          onPress={() =>
            router.push({
              pathname: '/navigation-first/detail-item',
              params: { row: title, source: 'Details' },
            })
          }
        >
          <Text style={[styles.number, { color: colors.muted }]}>{String(index + 1).padStart(2, '0')}</Text>
          <View style={styles.rowText}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.description, { color: colors.muted }]}>{description}</Text>
          </View>
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
  content: { paddingHorizontal: 20, paddingBottom: 160, gap: 8 },
  card: {
    marginBottom: 4,
    padding: 20,
    borderRadius: 24,
    borderCurve: 'continuous',
    gap: 6,
  },
  cardEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  cardTitle: { fontSize: 21, fontWeight: '600' },
  cardBody: { maxWidth: 300, fontSize: 15, lineHeight: 21 },
  row: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  number: { width: 30, fontSize: 13, fontVariant: ['tabular-nums'] },
  rowText: { flex: 1, gap: 4 },
  title: { fontSize: 17, fontWeight: '600' },
  description: { fontSize: 14, lineHeight: 19 },
  chevron: { fontSize: 28, lineHeight: 30 },
});
