import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { material3Dark as colors } from '../../../../theme';

const ROWS = Array.from({ length: 80 }, (_, index) => `Home row ${index + 1}`);

export default function NavigationFirstHome() {
  const router = useRouter();

  const openItem = (row: string) => {
    router.push({
      pathname: '/navigation-first/detail-item',
      params: { row, source: 'Home' },
    });
  };

  return (
    <ScrollView
      style={styles.host}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.card} onPress={() => openItem('Featured item')}>
        <Text style={styles.cardTitle}>Navigation first</Text>
        <Text style={styles.cardBody}>
          Home and Details keep independent tab state. Item details and creation live in the parent stack.
        </Text>
      </Pressable>

      {ROWS.map((row, index) => (
        <Pressable
          key={row}
          accessibilityRole="button"
          accessibilityLabel={`Open details for ${row}`}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => openItem(row)}
        >
          <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={styles.text}>{row}</Text>
          <Text style={styles.chevron} accessibilityElementsHidden>
            ›
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 160 },
  card: {
    marginBottom: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainer,
  },
  cardTitle: { color: colors.onSurface, fontSize: 20, fontWeight: '600' },
  cardBody: { color: colors.onSurfaceVariant, fontSize: 15, lineHeight: 21, marginTop: 8 },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  rowPressed: { backgroundColor: colors.surfaceContainerHigh },
  number: { width: 30, color: colors.outline },
  text: { flex: 1, color: colors.onSurface, fontSize: 17 },
  chevron: { color: colors.onSurfaceVariant, fontSize: 28, lineHeight: 30 },
});
