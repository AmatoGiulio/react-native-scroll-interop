import { ScrollView, StyleSheet, Text, View } from 'react-native';

const ROWS = Array.from({ length: 64 }, (_, index) => `Plain ScrollView row ${index + 1}`);

/**
 * Runtime control for ReactScrollView behavior outside NativeScrollHost.
 *
 * This route intentionally mounts no NativeScrollHost and no Material scroll-aware chrome. It is a
 * sanity check that the RN 0.83 source patch did not make ordinary ScrollViews depend on this
 * module or alter their basic gesture/fling behavior.
 */
export default function PlainScrollControlScreen() {
  return (
    <View style={styles.root}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Plain RN ScrollView control</Text>
        <Text style={styles.subtitle}>No NativeScrollHost. No native scroll-aware chrome.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {ROWS.map((row) => (
          <View key={row} style={styles.row}>
            <Text style={styles.rowText}>{row}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12141a' },
  titleBlock: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  title: { color: '#ECEFF4', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#8FA1B3', fontSize: 13, marginTop: 6 },
  content: { paddingBottom: 40 },
  row: { paddingHorizontal: 20, paddingVertical: 18 },
  rowText: { color: '#ECEFF4', fontSize: 16 },
});
