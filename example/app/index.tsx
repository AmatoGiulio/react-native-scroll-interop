import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Debug entry point. Every PoC route is reachable from here so a regression pass does not depend on
 * deep links reaching the dev client.
 */
const ROUTES = [
  { href: '/(tabs)', label: 'Tabs · Gallery (small, exitUntilCollapsed)' },
  { href: '/(tabs)/feed', label: 'Tabs · Feed (small, enterAlways)' },
  { href: '/(tabs)/profile', label: 'Tabs · Profile' },
  { href: '/solo', label: 'Solo · root stack (large, exitUntilCollapsed)' },
  { href: '/ref', label: 'Ref · host-app copy (large, exitUntilCollapsed)' },
  { href: '/source-remount', label: 'Lifecycle · remount real NativeScrollHost source' },
] as const;

export default function DebugIndex() {
  return (
    <View style={styles.root}>
      <Text style={styles.heading}>expo-material-toolbar PoC</Text>
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
  heading: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  link: {
    fontSize: 15,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
});
