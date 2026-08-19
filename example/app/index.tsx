import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function ExampleIndex() {
  return (
    <View style={styles.root}>
      <Text style={styles.heading}>react-native-scroll-interop</Text>
      <Link href="/navigation-first" style={styles.link}>
        Navigation first
      </Link>
      <Link href="/standalone" style={styles.link}>
        Standalone fallback
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', gap: 12, padding: 24 },
  heading: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  link: {
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
});
