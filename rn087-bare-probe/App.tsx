import React from 'react';
import {ScrollView, StatusBar, StyleSheet, Text, View} from 'react-native';

const ROWS = Array.from({length: 120}, (_, index) => index + 1);

type ProbeMode = 'ordinary' | 'snap' | 'snap-stress' | 'paging';
type AppProps = {probeMode?: ProbeMode};

export default function App({probeMode = 'ordinary'}: AppProps) {
  const directSnap = probeMode === 'snap' || probeMode === 'snap-stress';
  const pagingEnabled = directSnap || probeMode === 'paging';
  const snapToInterval = directSnap ? 184 : undefined;
  // snap-stress must be behaviorally identical to the already validated snap screen. Stress
  // coverage comes only from the gesture sequence and passive native diagnostics, never from a
  // different content geometry or a different React Native scroll prop.
  const renderedMode = probeMode === 'snap-stress' ? 'snap' : probeMode;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        nestedScrollEnabled
        pagingEnabled={pagingEnabled}
        snapToInterval={snapToInterval}
        showsVerticalScrollIndicator>
        <View style={styles.intro}>
          <Text style={styles.title}>RN 0.87 nested-scroll probe</Text>
          <Text style={styles.subtitle}>mode={renderedMode}</Text>
          <Text style={styles.subtitle}>
            The native source owns all movement. Snap/paging modes keep React Native's own animation
            path while exposing it as a TYPE_NON_TOUCH nested-scroll transaction.
          </Text>
        </View>
        {ROWS.map(row => (
          <View key={row} style={styles.row}>
            <Text style={styles.rowTitle}>Row {row}</Text>
            <Text style={styles.rowBody}>
              Drag and release cleanly for the target gate. Interruption/reversal gets its own
              regression gate after the basic snap transaction passes.
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
  row: {
    minHeight: 92,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#b8b8b8',
  },
  rowTitle: {fontSize: 17, fontWeight: '600', color: '#181818'},
  rowBody: {fontSize: 13, lineHeight: 18, color: '#5a5a5a', marginTop: 4},
});
