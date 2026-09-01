import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useDemoColors } from '../../theme/colors';

export default function NavigationFirstCreate() {
  const router = useRouter();
  const colors = useDemoColors();

  return (
    <ScrollView
      style={[styles.host, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>Title</Text>
        <TextInput
          accessibilityLabel="Item title"
          placeholder="Untitled"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>Description</Text>
        <TextInput
          accessibilityLabel="Item description"
          multiline
          placeholder="Optional"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          style={[
            styles.input,
            styles.multiline,
            { backgroundColor: colors.surface, color: colors.text },
          ]}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create item"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.accent },
          pressed && styles.buttonPressed,
        ]}
        onPress={() => router.back()}
      >
        <Text style={[styles.buttonText, { color: colors.onAccent }]}>Create</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  content: { paddingHorizontal: 20, paddingVertical: 20, paddingBottom: 48, gap: 22 },
  field: { gap: 8 },
  label: { paddingHorizontal: 4, fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderCurve: 'continuous',
    fontSize: 16,
  },
  multiline: { minHeight: 144, paddingTop: 16, textAlignVertical: 'top' },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
  },
  buttonPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  buttonText: { fontSize: 16, fontWeight: '700' },
});
