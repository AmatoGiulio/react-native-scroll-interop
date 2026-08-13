import React, {useState} from 'react';
import {Pressable, ScrollView, StatusBar, StyleSheet, Text, View} from 'react-native';

const ROWS = Array.from({length: 120}, (_, index) => index + 1);

export default function AppLifecycle() {
  const [sourceGeneration, setSourceGeneration] = useState(1);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        key={`source-${sourceGeneration}`}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        nestedScrollEnabled
        showsVerticalScrollIndicator>
        <View style={styles.intro}>
          <Text style={styles.title}>RN 0.87 source lifecycle probe</Text>
          <Text style={styles.subtitle}>
            Scroll source generation {sourceGeneration}. The Material chrome stays mounted while
            this React Native ScrollView is destroyed and replaced.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSourceGeneration(value => value + 1)}
            style={styles.button}>
            <Text style={styles.buttonText}>Remount scroll source</Text>
          </Pressable>
        </View>
        {ROWS.map(row => (
          <View key={`${sourceGeneration}-${row}`} style={styles.row}>
            <Text style={styles.rowTitle}>
              Source {sourceGeneration} · Row {row}
            </Text>
            <Text style={styles.rowBody}>
              Fling normally, return to the top, remount the source, then fling again.
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#f7f7f7'},
  scroll: {flex: 1},
  content: {paddingHorizontal: 16, paddingBottom: 48},
  intro: {paddingHorizontal: 4, paddingTop: 20, paddingBottom: 18},
  title: {fontSize: 22, fontWeight: '700', color: '#111111'},
  subtitle: {fontSize: 13, lineHeight: 18, color: '#555555', marginTop: 4},
  button: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#e3e3e3',
  },
  buttonText: {fontSize: 14, fontWeight: '600', color: '#111111'},
  row: {
    minHeight: 92,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#b8b8b8',
  },
  rowTitle: {fontSize: 17, fontWeight: '600', color: '#181818'},
  rowBody: {fontSize: 13, lineHeight: 18, color: '#5a5a5a', marginTop: 4},
});
