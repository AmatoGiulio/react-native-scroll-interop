import { MaterialToolbar, MaterialTopAppBar, NativeScrollHost } from 'expo-material-toolbar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const ROWS = Array.from({ length: 80 }, (_, index) => `Native transport row ${index + 1}`);

/**
 * Minimal production-adapter oracle.
 *
 * One RN ScrollView, one NativeScrollHost, one TopAppBar and one FloatingToolbar. No Tabs,
 * FlashList, screen reuse or cross-screen chrome. If scroll-aware chrome fails here, the failure is
 * in the RN/Android production transport itself rather than the example navigation harness.
 */
export default function TransportProbeScreen() {
  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.host}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {ROWS.map((row, index) => (
            <View key={row} style={styles.row}>
              <Text style={styles.rowNumber}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={styles.rowText}>{row}</Text>
            </View>
          ))}
        </ScrollView>
      </NativeScrollHost>

      <MaterialTopAppBar
        title="Transport probe"
        variant="large"
        scrollBehavior="exitUntilCollapsed"
      />

      <MaterialToolbar.Root
        placement="bottom"
        insets="none"
        scrollBehavior="exitAlways"
      >
        <MaterialToolbar.Content>
          <MaterialToolbar.TextButton accessibilityLabel="One">
            <MaterialToolbar.Text>One</MaterialToolbar.Text>
          </MaterialToolbar.TextButton>
          <MaterialToolbar.TextButton accessibilityLabel="Two">
            <MaterialToolbar.Text>Two</MaterialToolbar.Text>
          </MaterialToolbar.TextButton>
        </MaterialToolbar.Content>
        <MaterialToolbar.Fab accessibilityLabel="Add">
          <MaterialToolbar.Icon fallback="initial" />
        </MaterialToolbar.Fab>
      </MaterialToolbar.Root>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12141a' },
  host: { flex: 1 },
  content: { paddingBottom: 160 },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2e39',
  },
  rowNumber: { width: 28, color: '#8fa1b3', fontSize: 12 },
  rowText: { color: '#eceff4', fontSize: 17 },
});
