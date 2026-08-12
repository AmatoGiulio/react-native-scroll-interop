import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { NativeScrollHost, MaterialTopAppBar } from 'expo-material-toolbar';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { PHOTOS, type Photo } from '../src/photos';

const COLUMNS = 3;

/**
 * Diagnostic route: the same app bar and the same list, but mounted directly under the root stack
 * instead of inside the tab navigator.
 *
 * The tab version measures the app bar before the window insets reach it. This route exists to say
 * whether that ordering is caused by the tab/screen mounting or is inherent to the module.
 */
export default function SoloScreen() {
  const renderItem = useCallback(
    ({ item }: { item: Photo }) => (
      <View style={styles.cell}>
        <Image
          source={{ uri: item.uri }}
          style={styles.image}
          contentFit="cover"
          transition={120}
          backgroundColor={item.tint}
        />
      </View>
    ),
    []
  );

  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.host}>
        <FlashList data={PHOTOS} numColumns={COLUMNS} keyExtractor={(i) => i.id} renderItem={renderItem} />
      </NativeScrollHost>
      <MaterialTopAppBar title="Gallery" variant="large" scrollBehavior="exitUntilCollapsed" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12141a' },
  host: { flex: 1 },
  cell: { flex: 1 / COLUMNS, aspectRatio: 1, padding: 1 },
  image: { flex: 1, borderRadius: 2 },
});
