import {
  MaterialToolbar,
  MaterialTopAppBar,
  NativeScrollHost,
} from 'expo-material-toolbar';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const ROWS = Array.from({ length: 120 }, (_, index) => index + 1);

/**
 * Production lifecycle probe for the real NativeScrollHost transport.
 *
 * The Material chrome stays mounted while React destroys and replaces the RN ScrollView. The
 * FloatingToolbar owns the remount button so the control itself is outside the source lifecycle.
 * No JS onScroll handler participates in this test.
 */
export default function SourceRemountScreen() {
  const [generation, setGeneration] = useState(1);

  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.host}>
        <ScrollView
          key={`source-${generation}`}
          nestedScrollEnabled
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator
        >
          <View style={styles.intro}>
            <Text style={styles.title}>Production source lifecycle</Text>
            <Text style={styles.subtitle}>
              Scroll source generation {generation}. Fling, then use the native floating toolbar to
              replace this ScrollView while the chrome remains mounted.
            </Text>
          </View>

          {ROWS.map((row) => (
            <View key={`${generation}-${row}`} style={styles.row}>
              <Text style={styles.rowTitle}>Generation {generation} · Row {row}</Text>
              <Text style={styles.rowBody}>
                TopAppBar and FloatingToolbar consume the same native nested-scroll transaction.
              </Text>
            </View>
          ))}
        </ScrollView>
      </NativeScrollHost>

      <MaterialTopAppBar
        title={`Lifecycle ${generation}`}
        variant="large"
        scrollBehavior="exitUntilCollapsed"
      />

      <MaterialToolbar.Root
        style={StyleSheet.absoluteFill}
        placement="bottom"
        insets="safe"
        scrollBehavior="exitAlways"
        scrollExitDirection="bottom"
      >
        <MaterialToolbar.Content>
          <MaterialToolbar.TextButton
            id="remount-source"
            accessibilityLabel="Remount scroll source"
            onPress={() => setGeneration((value) => value + 1)}
          >
            <MaterialToolbar.Text>Remount {generation}</MaterialToolbar.Text>
          </MaterialToolbar.TextButton>
        </MaterialToolbar.Content>
      </MaterialToolbar.Root>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12141a' },
  host: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 72 },
  intro: { paddingHorizontal: 4, paddingTop: 20, paddingBottom: 18 },
  title: { color: '#ECEFF4', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#AAB6C3', fontSize: 13, lineHeight: 18, marginTop: 4 },
  row: {
    minHeight: 92,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#374151',
  },
  rowTitle: { color: '#ECEFF4', fontSize: 17, fontWeight: '600' },
  rowBody: { color: '#8FA1B3', fontSize: 13, lineHeight: 18, marginTop: 4 },
});
