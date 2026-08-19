import { useState } from 'react';
import { MaterialToolbar, MaterialTopAppBar, NativeScrollHost } from 'react-native-scroll-interop';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const rows = Array.from({ length: 200 }, (_, i) => String(i + 1));

export default function TransportImeStressProbe() {
  const [bypassImeHide, setBypassImeHide] = useState(false);

  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.host}>
        <FlatList
          data={rows}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.content}
          ListHeaderComponent={<TextInput style={styles.input} placeholder="Focus input - toolbar must hide" />}
          renderItem={({ item }) => <Text style={styles.row}>Row {item}</Text>}
        />
      </NativeScrollHost>
      <MaterialTopAppBar title="IME hide stress" variant="large" scrollBehavior="exitUntilCollapsed" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle IME hide bypass"
        onPress={() => setBypassImeHide((value) => !value)}
        style={styles.oracle}
      >
        <Text style={styles.oracleText}>
          {bypassImeHide ? 'IME BYPASS: none' : 'IME BYPASS: hide'}
        </Text>
      </Pressable>
      <MaterialToolbar.Root
        placement="bottom"
        insets="safe"
        imeBehavior={bypassImeHide ? 'none' : 'hide'}
        scrollBehavior="exitAlways"
      >
        <MaterialToolbar.Content>
          <MaterialToolbar.TextButton accessibilityLabel="One"><MaterialToolbar.Text>One</MaterialToolbar.Text></MaterialToolbar.TextButton>
        </MaterialToolbar.Content>
      </MaterialToolbar.Root>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12141a' },
  host: { flex: 1 },
  content: { paddingBottom: 160 },
  input: { minHeight: 52, marginHorizontal: 20, marginBottom: 20, padding: 12, backgroundColor: '#ffffff', color: '#111111' },
  row: { minHeight: 64, padding: 20, color: '#eceff4' },
  oracle: {
    position: 'absolute',
    top: 72,
    right: 16,
    zIndex: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#30323a',
  },
  oracleText: { color: '#ffffff', fontSize: 12 },
});