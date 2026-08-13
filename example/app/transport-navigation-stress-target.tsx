import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function TransportNavigationStressTargetScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Old transport screen replaced</Text>
      <Text style={styles.note}>
        Go back by replacing this screen with a fresh transport host, then repeat during another fling.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/transport-navigation-stress-probe')}
        style={styles.action}
      >
        <Text style={styles.actionText}>Create fresh transport screen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    padding: 28,
    backgroundColor: '#12141a',
  },
  title: { color: '#eceff4', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  note: { color: '#aab2bf', fontSize: 16, textAlign: 'center' },
  action: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, backgroundColor: '#ffffff' },
  actionText: { color: '#111827', fontWeight: '700' },
});
