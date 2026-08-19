import { MaterialToolbar, MaterialTopAppBar, NativeScrollHost } from 'react-native-scroll-interop';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

const ROWS = Array.from({ length: 500 }, (_, index) => ({ id: String(index), label: `Stress row ${index + 1}` }));

export default function TransportLifecycleStressProbeScreen() {
  const [generation, setGeneration] = useState(1);

  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.host}>
        <FlatList
          key={`source-${generation}`}
          data={ROWS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          renderItem={({ item, index }) => (
            <View style={styles.row}>
              <Text style={styles.number}>{String(index + 1).padStart(3, '0')}</Text>
              <Text style={styles.text}>{item.label}</Text>
            </View>
          )}
        />
      </NativeScrollHost>

      <MaterialTopAppBar title={`Lifecycle stress ${generation}`} variant="large" scrollBehavior="exitUntilCollapsed" />

      <Pressable style={styles.remount} onPress={() => setGeneration((value) => value + 1)}>
        <Text style={styles.remountText}>Remount source #{generation}</Text>
      </Pressable>

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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12141a' },
  host: { flex: 1 },
  content: { paddingBottom: 160 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20 },
  number: { width: 36, color: '#8fa1b3', fontSize: 12 },
  text: { color: '#eceff4', fontSize: 17 },
  remount: { position: 'absolute', top: 188, right: 12, backgroundColor: '#303642', padding: 12, borderRadius: 10 },
  remountText: { color: '#eceff4', fontSize: 13, fontWeight: '600' },
});
