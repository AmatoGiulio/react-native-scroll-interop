import { NativeScrollHost, MaterialTopAppBar } from 'react-native-scroll-interop';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const SECTIONS = [
  { title: 'Account', rows: ['Name', 'Email', 'Password', 'Linked devices'] },
  { title: 'Library', rows: ['Storage', 'Backup', 'Download quality', 'Offline albums'] },
  { title: 'Privacy', rows: ['Shared links', 'Blocked people', 'Face grouping', 'Location data'] },
  { title: 'Notifications', rows: ['Memories', 'Comments', 'Suggestions', 'Product updates'] },
  { title: 'About', rows: ['Version', 'Open-source licences', 'Terms', 'Feedback'] },
];

/**
 * Profile: a plain React Native `ScrollView`, not a list library.
 *
 * This is deliberately the large + exitUntilCollapsed case. Feed covers enterAlways on FlashList;
 * Profile exercises the complementary top-edge post-scroll path on React Native's own ScrollView.
 * If this screen behaves differently from Gallery under the same large-bar behavior, the transport
 * has grown an accidental dependency on how FlashList happens to scroll.
 */
export default function ProfileScreen() {
  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.host}>
        <ScrollView contentContainerStyle={styles.content}>
          {SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.rows.map((row) => (
                <View key={row} style={styles.row}>
                  <Text style={styles.rowLabel}>{row}</Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </NativeScrollHost>
      <MaterialTopAppBar title="Profile" variant="large" scrollBehavior="exitUntilCollapsed" />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  root: { flex: 1, backgroundColor: '#12141a' },
  content: { paddingBottom: 32 },
  section: { paddingTop: 20 },
  sectionTitle: {
    color: '#8FA1B3',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  row: { paddingHorizontal: 20, paddingVertical: 14 },
  rowLabel: { color: '#ECEFF4', fontSize: 15 },
});
