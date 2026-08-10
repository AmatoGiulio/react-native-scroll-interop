import { FlashList } from '@shopify/flash-list';
import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaterialTopAppBar } from 'expo-material-toolbar';

/**
 * Faithful copy of the screen that works in the host app, with only the private design-system
 * pieces (`ListItem`, `Avatar`, unistyles theme tokens) swapped for plain equivalents. Everything
 * that could affect layout or mounting order is kept: masonry, two columns, `style` on the list,
 * the `useSafeAreaInsets()` call, `dynamicColor`, and the sibling order of list and app bar.
 */
const DATA = new Array(100).fill(0).map((_, index) => ({ id: index }));
const ITEM_SIZE = 80;

const ItemComponent = ({ index }: { index: number }) => (
  <View style={styles.item}>
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>Q</Text>
    </View>
    <View>
      <Text style={styles.title}>{`Item ${index}`}</Text>
      <Text style={styles.description}>Description</Text>
    </View>
  </View>
);

const Ref = () => {
  const insets = useSafeAreaInsets();
  const renderItem = useCallback(
    ({ index }: { item: any; index: number }) => <ItemComponent index={index} />,
    []
  );

  return (
    <View style={{ flex: 1 }}>
      <FlashList
        renderItem={renderItem}
        data={DATA}
        masonry
        numColumns={2}
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainerStyle}
      />
      <MaterialTopAppBar
        dynamicColor
        title="Native scroll PoC"
        variant="large"
        scrollBehavior="exitUntilCollapsed"
      />
    </View>
  );
};

export default Ref;

const styles = StyleSheet.create({
  container: { flex: 1 },
  item: {
    height: ITEM_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#2A2E39',
    borderRadius: 16,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#5E81AC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: 'white', fontWeight: '600' },
  title: { color: '#ECEFF4', fontSize: 15, fontWeight: '600' },
  description: { color: '#8FA1B3', fontSize: 13 },
  contentContainerStyle: { padding: 16 },
});
