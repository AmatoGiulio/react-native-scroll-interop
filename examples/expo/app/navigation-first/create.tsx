import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

export default function NavigationFirstCreate() {
  const router = useRouter();

  return (
    <ScrollView
      style={styles.host}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>Title</Text>
      <TextInput
        accessibilityLabel="Item title"
        placeholder="New item"
        placeholderTextColor="#748191"
        selectionColor="#c6b8ff"
        style={styles.input}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        accessibilityLabel="Item description"
        multiline
        placeholder="Add a short description"
        placeholderTextColor="#748191"
        selectionColor="#c6b8ff"
        style={[styles.input, styles.multiline]}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create item"
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => router.back()}
      >
        <Text style={styles.buttonText}>Create</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: '#101318' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  label: { color: '#e6eaf0', fontSize: 14, fontWeight: '600', marginTop: 10 },
  input: {
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#20252d',
    color: '#f4f6f8',
    fontSize: 16,
  },
  multiline: { minHeight: 144, paddingTop: 16, textAlignVertical: 'top' },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderRadius: 26,
    backgroundColor: '#c6b8ff',
  },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: '#2c2056', fontSize: 16, fontWeight: '700' },
});
