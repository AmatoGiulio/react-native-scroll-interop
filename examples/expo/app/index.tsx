import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function ExampleIndex() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>react-native-scroll-interop</Text>
      <Pressable style={styles.link} onPress={() => router.push('/navigation-first')}>
        <Text style={styles.linkText}>Navigation first</Text>
      </Pressable>
      <Pressable style={styles.link} onPress={() => router.push('/standalone')}>
        <Text style={styles.linkText}>Standalone fallback</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', gap: 12, padding: 24 },
  heading: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  link: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  linkText: { color: '#111827', fontSize: 16 },
});
