import { MaterialToolbar, MaterialTopAppBar, NativeScrollHost } from 'react-native-scroll-interop';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

const ROWS = Array.from({ length: 500 }, (_, index) => ({
  id: String(index + 1),
  label: `Navigation stress row ${index + 1}`,
}));

export default function TransportNavigationStressProbeScreen() {
  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.host}>
        <FlatList
          data={ROWS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowText}>{item.label}</Text>
            </View>
          )}
        />
      </NativeScrollHost>

      <MaterialTopAppBar
        title="Navigation stress"
        variant="large"
        scrollBehavior="exitUntilCollapsed"
      />

      <MaterialToolbar.Root placement="bottom" insets="none" scrollBehavior="exitAlways">
        <MaterialToolbar.Content>
          <MaterialToolbar.TextButton accessibilityLabel="One">
            <MaterialToolbar.Text>One</MaterialToolbar.Text>
          </MaterialToolbar.TextButton>
        </MaterialToolbar.Content>
        <MaterialToolbar.Fab accessibilityLabel="Add">
          <MaterialToolbar.Icon fallback="initial" />
        </MaterialToolbar.Fab>
      </MaterialToolbar.Root>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/transport-navigation-stress-target')}
        style={styles.action}
      >
        <Text style={styles.actionText}>Replace whole screen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12141a' },
  host: { flex: 1 },
  content: { paddingBottom: 160 },
  row: { minHeight: 72, justifyContent: 'center', paddingHorizontal: 20 },
  rowText: { color: '#eceff4', fontSize: 17 },
  action: {
    position: 'absolute',
    right: 16,
    top: 220,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  actionText: { color: '#111827', fontWeight: '700' },
});
