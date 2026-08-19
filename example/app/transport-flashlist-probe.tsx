import { FlashList } from '@shopify/flash-list';
import { MaterialToolbar, MaterialTopAppBar, NativeScrollHost } from 'react-native-scroll-interop';
import { StyleSheet, Text, View } from 'react-native';

const ROWS = Array.from({ length: 600 }, (_, index) => ({
  id: String(index + 1),
  label: `FlashList transport row ${index + 1}`,
}));

/**
 * Third production-matrix probe.
 *
 * This mirrors the stock React Native list probes and changes only the virtualized list engine to
 * FlashList. No scroll refs, JS scroll callbacks or transport-specific FlashList tuning are used.
 */
export default function TransportFlashListProbeScreen() {
  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.host}>
        <FlashList
          data={ROWS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <View style={styles.row}>
              <Text style={styles.rowNumber}>{String(index + 1).padStart(3, '0')}</Text>
              <Text style={styles.rowText}>{item.label}</Text>
            </View>
          )}
        />
      </NativeScrollHost>

      <MaterialTopAppBar
        title="FlashList probe"
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
  rowNumber: { width: 44, color: '#8fa1b3', fontSize: 12 },
  rowText: { color: '#eceff4', fontSize: 17 },
});
