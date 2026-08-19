import { MaterialToolbar, MaterialTopAppBar, NativeScrollHost } from 'react-native-scroll-interop';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

const ROWS = Array.from({ length: 420 }, (_, index) => ({
  id: String(index + 1),
  label: `Orientation stress row ${index + 1}`,
}));

/**
 * Geometry/configuration stress probe.
 *
 * The app is intentionally unlocked for portrait/landscape in app.json. Rotate the device while
 * dragging or immediately after a fling and verify that the same RN scroll source remains usable,
 * while the native TopAppBar and FloatingToolbar remeasure against the new Fabric bounds.
 */
export default function TransportOrientationStressProbeScreen() {
  const { width, height } = useWindowDimensions();
  const orientation = width > height ? 'landscape' : 'portrait';

  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.host}>
        <FlatList
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
        title="Orientation stress"
        variant="large"
        scrollBehavior="exitUntilCollapsed"
      />

      <MaterialToolbar.Root placement="bottom" insets="none" scrollBehavior="exitAlways">
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

      <View pointerEvents="none" style={styles.badge}>
        <Text style={styles.badgeText}>
          {Math.round(width)} x {Math.round(height)} · {orientation}
        </Text>
      </View>
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
  rowNumber: { width: 36, color: '#8fa1b3', fontSize: 12 },
  rowText: { color: '#eceff4', fontSize: 17 },
  badge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    borderRadius: 10,
    backgroundColor: '#000000cc',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: { color: '#ffffff', fontSize: 12, fontVariant: ['tabular-nums'] },
});
