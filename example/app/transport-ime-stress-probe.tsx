import { MaterialToolbar, MaterialTopAppBar, NativeScrollHost } from 'expo-material-toolbar';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

const rows = Array.from({ length: 200 }, (_, i) => String(i + 1));

export default function TransportImeStressProbe() {
  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.host}>
        <FlatList
          data={rows}
          keyExtractor={(item) => item}
          ListHeaderComponent={<TextInput style={styles.input} placeholder="Focus input" />}
          renderItem={({ item }) => <Text style={styles.row}>Row {item}</Text>}
        />
      </NativeScrollHost>
      <MaterialTopAppBar title="IME stress" variant="large" scrollBehavior="exitUntilCollapsed" />
      <MaterialToolbar.Root placement="bottom" insets="safe" imeBehavior="none" scrollBehavior="exitAlways">
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
  input: { minHeight: 52, marginTop: 220, margin: 20, padding: 12, backgroundColor: '#ffffff', color: '#111111' },
  row: { minHeight: 64, padding: 20, color: '#eceff4' },
});
