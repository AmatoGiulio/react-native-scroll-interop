import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Debug entry point. Every PoC route is reachable from here so a regression pass does not depend on
 * deep links reaching the dev client.
 */
const ROUTES = [
  { href: '/transport-probe', label: 'Transport probe · ScrollView + TopAppBar + FloatingToolbar' },
  { href: '/(tabs)', label: 'Tabs · Gallery (legacy harness)' },
  { href: '/(tabs)/feed', label: 'Tabs · Feed (legacy harness)' },
  { href: '/(tabs)/profile', label: 'Tabs · Profile (legacy harness)' },
  { href: '/solo', label: 'Solo · FlashList root stack' },
  { href: '/ref', label: 'Ref · host-app FlashList copy' },
] as const;

export default function DebugIndex() {
  return (
    <View style={styles.root}>
      <Text style={styles.heading}>expo-material-toolbar PoC</Text>
      <Text style={styles.note}>
        Validate the minimal transport probe before using Tabs or FlashList as an oracle.
      </Text>
      {ROUTES.map((route) => (
        <Link key={route.href} href={route.href as never} style={styles.link}>
          {route.label}
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', gap: 12, padding: 24 },
  heading: { fontSize: 18, fontWeight: '600' },
  note: { fontSize: 13, color: '#4B5563', marginBottom: 8 },
  link: {
    fontSize: 15,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
});
