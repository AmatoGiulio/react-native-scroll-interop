import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const ROWS = Array.from({ length: 36 }, (_, index) => `Item information ${index + 1}`);

export default function NavigationFirstDetailItem() {
  const { row, source } = useLocalSearchParams<{ row?: string; source?: string }>();

  return (
    <ScrollView
      style={styles.host}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{source ?? 'Item'}</Text>
        <Text style={styles.cardTitle}>{row ?? 'Selected item'}</Text>
        <Text style={styles.cardBody}>
          This route belongs to the parent stack, so the floating tab bar and its action button are not rendered here.
        </Text>
      </View>

      {ROWS.map((item, index) => (
        <View key={item} style={styles.row}>
          <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={styles.text}>{item}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: '#101318' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    marginBottom: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#20252d',
  },
  eyebrow: {
    color: '#c6b8ff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardTitle: { color: '#f4f6f8', fontSize: 24, fontWeight: '600', marginTop: 8 },
  cardBody: { color: '#aeb8c4', fontSize: 15, lineHeight: 21, marginTop: 8 },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  number: { width: 30, color: '#748191' },
  text: { color: '#e6eaf0', fontSize: 17 },
});
