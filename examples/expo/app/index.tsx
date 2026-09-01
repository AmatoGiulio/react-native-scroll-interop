import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDemoColors } from '../theme/colors';

const DEMOS = [
  {
    route: '/navigation-first' as const,
    index: '01',
    title: 'Navigation',
    description: 'Tabs, stacks and native Material chrome.',
  },
  {
    route: '/standalone' as const,
    index: '02',
    title: 'React Native',
    description: 'A standalone ScrollView host.',
  },
  {
    route: '/expo-ui-lazy-column' as const,
    index: '03',
    title: 'Expo UI',
    description: 'A Compose LazyColumn source.',
  },
] as const;

export default function ExampleIndex() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useDemoColors();

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 32 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>REFERENCE APP</Text>
        <Text style={[styles.heading, { color: colors.text }]}>Scroll interop</Text>
        <Text style={[styles.subheading, { color: colors.muted }]}>One native scroll transaction. Three integrations.</Text>
      </View>

      <View style={styles.list}>
        {DEMOS.map((demo) => (
          <Pressable
            key={demo.route}
            accessibilityRole="button"
            accessibilityLabel={`Open ${demo.title} demo`}
            style={({ pressed }) => [
              styles.link,
              { backgroundColor: pressed ? colors.pressed : colors.surface },
            ]}
            onPress={() => router.push(demo.route)}
          >
            <Text style={[styles.index, { color: colors.muted }]}>{demo.index}</Text>
            <View style={styles.linkCopy}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>{demo.title}</Text>
              <Text style={[styles.linkDescription, { color: colors.muted }]}>{demo.description}</Text>
            </View>
            <Text style={[styles.chevron, { color: colors.muted }]} accessibilityElementsHidden>
              ›
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', gap: 40, paddingHorizontal: 24 },
  hero: { gap: 8 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  heading: { fontSize: 40, fontWeight: '700', letterSpacing: -1.2 },
  subheading: { maxWidth: 300, fontSize: 17, lineHeight: 24 },
  list: { gap: 10 },
  link: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 22,
    borderCurve: 'continuous',
  },
  index: { width: 28, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  linkCopy: { flex: 1, gap: 3 },
  linkTitle: { fontSize: 18, fontWeight: '600' },
  linkDescription: { fontSize: 14, lineHeight: 19 },
  chevron: { fontSize: 28, lineHeight: 30 },
});
