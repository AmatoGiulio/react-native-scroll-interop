import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { NativeScrollHost } from 'react-native-scroll-interop';

const ROWS = Array.from({ length: 64 }, (_, index) => `Details row ${index + 1}`);

export default function NavigationFirstDetails() {
  return (
    <NativeScrollHost style={styles.host}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details screen</Text>
          <Text style={styles.cardBody}>
            This screen declares no TopAppBar and no FloatingToolbar. Both come from the navigation layout.
          </Text>
        </View>

        {ROWS.map((row, index) => (
          <View key={row} style={styles.row}>
            <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
            <Text style={styles.text}>{row}</Text>
          </View>
        ))}
      </ScrollView>
    </NativeScrollHost>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: '#101318' },
  content: { paddingHorizontal: 20, paddingBottom: 160 },
  card: {
    marginTop: 16,
    marginBottom: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#20252d',
  },
  cardTitle: { color: '#f4f6f8', fontSize: 20, fontWeight: '600' },
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
