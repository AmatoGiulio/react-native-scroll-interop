import React from 'react';
import {ScrollView, StatusBar, StyleSheet, Text, View} from 'react-native';

const ROWS = Array.from({length: 120}, (_, index) => index + 1);

export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>RN 0.87 nested-scroll probe</Text>
        <Text style={styles.subtitle}>
          Native parent observes the real ScrollView transaction and consumes zero.
        </Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        nestedScrollEnabled
        showsVerticalScrollIndicator>
        {ROWS.map(row => (
          <View key={row} style={styles.row}>
            <Text style={styles.rowTitle}>Row {row}</Text>
            <Text style={styles.rowBody}>
              Drag, fling, reverse, and fling again. No JS onScroll handler is installed.
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#f7f7f7'},
  header: {paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14},
  title: {fontSize: 22, fontWeight: '700', color: '#111111'},
  subtitle: {fontSize: 13, lineHeight: 18, color: '#555555', marginTop: 4},
  scroll: {flex: 1},
  content: {paddingHorizontal: 16, paddingBottom: 48},
  row: {
    minHeight: 92,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#b8b8b8',
  },
  rowTitle: {fontSize: 17, fontWeight: '600', color: '#181818'},
  rowBody: {fontSize: 13, lineHeight: 18, color: '#5a5a5a', marginTop: 4},
});
