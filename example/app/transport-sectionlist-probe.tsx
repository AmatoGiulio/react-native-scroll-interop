import { MaterialToolbar, MaterialTopAppBar, NativeScrollHost } from 'react-native-scroll-interop';
import { SectionList, StyleSheet, Text, View } from 'react-native';

const SECTIONS = Array.from({ length: 12 }, (_, sectionIndex) => ({
  title: `Section ${sectionIndex + 1}`,
  data: Array.from({ length: 20 }, (_, rowIndex) => ({
    id: `${sectionIndex + 1}-${rowIndex + 1}`,
    label: `SectionList row ${sectionIndex + 1}.${rowIndex + 1}`,
  })),
}));

/**
 * Second production-matrix probe.
 *
 * This keeps the same native host and Material chrome as the ScrollView/FlatList probes and swaps
 * only the React Native list primitive to SectionList. Section headers exercise virtualization and
 * section bookkeeping without adding any transport workaround.
 */
export default function TransportSectionListProbeScreen() {
  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.host}>
        <SectionList
          sections={SECTIONS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item, index, section }) => (
            <View style={styles.row}>
              <Text style={styles.rowNumber}>
                {section.title.replace('Section ', '')}.{String(index + 1).padStart(2, '0')}
              </Text>
              <Text style={styles.rowText}>{item.label}</Text>
            </View>
          )}
        />
      </NativeScrollHost>

      <MaterialTopAppBar
        title="SectionList probe"
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
  sectionHeader: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#1b1f28',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#343a48',
  },
  sectionHeaderText: { color: '#aebdcc', fontSize: 13, fontWeight: '600' },
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
