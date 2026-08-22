import React from 'react';
import {ScrollView, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {
  MaterialTopAppBar,
  NativeScrollHost,
} from 'react-native-scroll-interop';

const ROWS = Array.from({length: 80}, (_, index) => index + 1);
const LARGE_APP_BAR_HEIGHT = 152;

export default function App() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" />
        <MaterialTopAppBar
          title="Bare React Native"
          variant="large"
          scrollBehavior="exitUntilCollapsed"
        />
        <NativeScrollHost style={styles.host}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            nestedScrollEnabled
            showsVerticalScrollIndicator>
            <View style={styles.intro}>
              <Text style={styles.title}>react-native-scroll-interop</Text>
              <Text style={styles.subtitle}>
                Bare React Native 0.87 consumer. React Native owns touch, position and fling physics;
                the native Material3 app bar participates in the same Android nested-scroll transaction.
              </Text>
            </View>
            {ROWS.map(row => (
              <View key={row} style={styles.row}>
                <Text style={styles.rowTitle}>Row {row}</Text>
                <Text style={styles.rowBody}>
                  Drag, release, fling, reverse and interrupt momentum to exercise the native path.
                </Text>
              </View>
            ))}
          </ScrollView>
        </NativeScrollHost>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#f7f7f7'},
  host: {flex: 1},
  scroll: {flex: 1},
  content: {
    paddingTop: LARGE_APP_BAR_HEIGHT + 16,
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  intro: {paddingHorizontal: 4, paddingBottom: 18},
  title: {fontSize: 22, fontWeight: '700', color: '#111111'},
  subtitle: {fontSize: 13, lineHeight: 19, color: '#555555', marginTop: 6},
  row: {
    minHeight: 92,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#b8b8b8',
  },
  rowTitle: {fontSize: 17, fontWeight: '600', color: '#181818'},
  rowBody: {fontSize: 13, lineHeight: 18, color: '#5a5a5a', marginTop: 4},
});
