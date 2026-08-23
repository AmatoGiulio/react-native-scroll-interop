import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const SECTIONS = [
  ['Architecture', 'Nested scroll ownership and native UI consumers'],
  ['Navigation', 'Independent tab histories inside a parent stack'],
  ['Motion', 'Synchronous toolbar movement driven by Android scroll'],
  ['Material 3', 'Native top app bars, toolbar actions and FAB'],
  ['Lifecycle', 'Screen attachment, detachment and restored state'],
  ['Conservation', 'Every consumed pixel is accounted for once'],
  ['React Native', 'Version-neutral vertical scroll source support'],
  ['Screens', 'Frontmost-screen participant resolution'],
  ['Expo', 'Config plugin and navigation-first integration'],
  ['Bare RN', 'Direct package registration and compatibility'],
  ['Accessibility', 'Native semantics for navigation actions'],
  ['Release', 'Deterministic checks for the public alpha'],
] as const;

export default function NavigationFirstDetails() {
  const router = useRouter();

  return (
    <ScrollView
      style={styles.host}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Implementation details</Text>
        <Text style={styles.cardBody}>
          This is a separate tab screen with its own native stack and preserved scroll position.
        </Text>
      </View>

      {SECTIONS.map(([title, description], index) => (
        <Pressable
          key={title}
          accessibilityRole="button"
          accessibilityLabel={`Open ${title}`}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() =>
            router.push({
              pathname: '/navigation-first/detail-item',
              params: { row: title, source: 'Details' },
            })
          }
        >
          <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
          <View style={styles.rowText}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
          <Text style={styles.chevron} accessibilityElementsHidden>
            ›
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: '#101318' },
  content: { paddingHorizontal: 20, paddingBottom: 160, gap: 8 },
  card: {
    marginBottom: 4,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#20252d',
  },
  cardTitle: { color: '#f4f6f8', fontSize: 20, fontWeight: '600' },
  cardBody: { color: '#aeb8c4', fontSize: 15, lineHeight: 21, marginTop: 8 },
  row: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  rowPressed: { backgroundColor: '#20252d' },
  number: { width: 30, color: '#748191' },
  rowText: { flex: 1, gap: 4 },
  title: { color: '#e6eaf0', fontSize: 17, fontWeight: '600' },
  description: { color: '#aeb8c4', fontSize: 14, lineHeight: 19 },
  chevron: { color: '#aeb8c4', fontSize: 28, lineHeight: 30 },
});
