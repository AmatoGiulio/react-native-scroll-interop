import { NativeScrollHost, MaterialTopAppBar } from 'expo-material-toolbar';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const ROWS = Array.from({ length: 48 }, (_, index) => `Delayed source row ${index + 1}`);
const SOURCE_DELAY_MS = 900;

/**
 * Diagnostic route for the layout-driven source-preparation fallback.
 *
 * The NativeScrollHost and TopAppBar mount immediately, while the React Native ScrollView is
 * deliberately withheld for a short interval. The native host should arm its temporary global
 * layout listener, discover the source when React mounts it, prepare the geometry, then remove the
 * listener. No production screen should need this artificial delay.
 */
export default function DelayedSourceScreen() {
  const [sourceMounted, setSourceMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSourceMounted(true), SOURCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.host}>
        {sourceMounted ? (
          <ScrollView contentContainerStyle={styles.content}>
            {ROWS.map((row) => (
              <View key={row} style={styles.row}>
                <Text style={styles.rowText}>{row}</Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.waiting}>
            <Text style={styles.waitingText}>Mounting ScrollView after {SOURCE_DELAY_MS} ms…</Text>
          </View>
        )}
      </NativeScrollHost>

      <MaterialTopAppBar
        title="Delayed source"
        variant="large"
        scrollBehavior="exitUntilCollapsed"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12141a' },
  host: { flex: 1 },
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  waitingText: { color: '#ECEFF4', fontSize: 16, textAlign: 'center' },
  content: { paddingBottom: 40 },
  row: { paddingHorizontal: 20, paddingVertical: 18 },
  rowText: { color: '#ECEFF4', fontSize: 16 },
});
