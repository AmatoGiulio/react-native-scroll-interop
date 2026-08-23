import React from 'react';
import {ScrollView, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {
  MaterialToolbar,
  MaterialTopAppBar,
  NativeScrollHost,
} from 'react-native-scroll-interop';

const MOMENTS = [
  ['Touch', 'React Native keeps the gesture and source position.'],
  ['Collapse', 'Material 3 joins the same synchronous transaction.'],
  ['Fling', 'One velocity, one physics owner, native motion.'],
  ['Reverse', 'Interrupt momentum and change direction immediately.'],
  ['Settle', 'Material state finishes the app bar naturally.'],
  ['Observe', 'The FloatingToolbar follows without consuming distance.'],
  ['Conserve', 'PRE, child and POST distance always add up.'],
  ['Repeat', 'Every interaction stays on the native Android path.'],
] as const;

export default function App() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" />

        <NativeScrollHost style={styles.host}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}>
            <View style={styles.intro}>
              <View style={styles.badges}>
                <Text style={styles.badge}>ANDROID</Text>
                <Text style={styles.badge}>RN 0.87</Text>
                <Text style={styles.badge}>MATERIAL 3</Text>
              </View>
              <Text style={styles.title}>One scroll. Native motion.</Text>
              <Text style={styles.subtitle}>
                Drag, fling, reverse and interrupt. The app bar and floating
                toolbar participate without creating a second scroll engine.
              </Text>
            </View>

            {MOMENTS.map(([title, body], index) => (
              <View key={title} style={styles.card}>
                <View style={styles.cardIndex}>
                  <Text style={styles.cardIndexText}>
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{title}</Text>
                  <Text style={styles.cardBody}>{body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </NativeScrollHost>

        <MaterialTopAppBar
          title="Scroll interop"
          variant="large"
          scrollBehavior="exitUntilCollapsed"
          themeMode="light"
          dynamicColor={false}
        />

        <MaterialToolbar.Root
          placement="bottom"
          insets="safe"
          scrollBehavior="exitAlways"
          themeMode="light"
          dynamicColor={false}
          colors={{
            toolbarContainer: '#E8DEF8',
            toolbarContent: '#1D192B',
            fabContainer: '#6750A4',
            fabContent: '#FFFFFF',
          }}>
          <MaterialToolbar.Content>
            <MaterialToolbar.TextButton accessibilityLabel="Pre-scroll">
              <MaterialToolbar.Text>PRE</MaterialToolbar.Text>
            </MaterialToolbar.TextButton>
            <MaterialToolbar.TextButton accessibilityLabel="Post-scroll">
              <MaterialToolbar.Text>POST</MaterialToolbar.Text>
            </MaterialToolbar.TextButton>
          </MaterialToolbar.Content>
          <MaterialToolbar.Fab accessibilityLabel="Scroll interop">
            <MaterialToolbar.Icon fallback="initial" />
          </MaterialToolbar.Fab>
        </MaterialToolbar.Root>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F7F4FA'},
  host: {flex: 1},
  scroll: {flex: 1},
  content: {
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 152,
    gap: 12,
  },
  intro: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 12,
  },
  badges: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16},
  badge: {
    color: '#6750A4',
    backgroundColor: '#EADDFF',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  title: {
    color: '#1D1B20',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: '#625B71',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
    maxWidth: 520,
  },
  card: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 24,
    backgroundColor: '#FFFBFE',
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 2},
  },
  cardIndex: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EADDFF',
  },
  cardIndexText: {
    color: '#4F378B',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cardCopy: {flex: 1},
  cardTitle: {
    color: '#1D1B20',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
  },
  cardBody: {
    color: '#625B71',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
});
