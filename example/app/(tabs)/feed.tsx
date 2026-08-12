import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { NativeScrollHost, MaterialTopAppBar } from 'expo-material-toolbar';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PHOTOS, type Photo } from '../../src/photos';

/**
 * Feed: same transport, different Material behaviour.
 *
 * `enterAlways` re-enters as soon as the user scrolls back, without waiting for the content to
 * reach the top. Running it beside the gallery's `exitUntilCollapsed` on the same coordinator is
 * the cheapest way to notice if one behaviour's state is leaking into the other.
 */
export default function FeedScreen() {
  const renderItem = useCallback(
    ({ item }: { item: Photo }) => (
      <View style={styles.card}>
        <Image
          source={{ uri: item.uri }}
          style={styles.thumb}
          contentFit="cover"
          transition={120}
        />
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardMeta}>{item.author}</Text>
        </View>
      </View>
    ),
    []
  );

  return (
    <View style={styles.root}>
      <NativeScrollHost style={{ flex: 1 }}>

        <FlashList
          data={PHOTOS}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      </NativeScrollHost>
      <MaterialTopAppBar title="Feed" variant="small" scrollBehavior="enterAlways" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12141a' },
  listContent: { paddingBottom: 24 },
  card: { flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { color: '#ECEFF4', fontSize: 15, fontWeight: '600' },
  cardMeta: { color: '#8FA1B3', fontSize: 13 },
});
