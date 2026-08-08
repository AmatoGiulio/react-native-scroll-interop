import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { MaterialToolbar, MaterialTopAppBar } from 'expo-material-toolbar';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PHOTOS, type Photo } from '../../src/photos';

const COLUMNS = 3;

/**
 * Gallery: FlashList image grid driving both Material consumers at once.
 *
 * There is no `onScroll` handler anywhere on this screen, and no ref is handed to either piece of
 * chrome. The app bar and the floating toolbar both react to the same natively sampled scroll.
 */
export default function GalleryScreen() {
  const [selected, setSelected] = useState<string | null>(null);

  const renderItem = useCallback(
    ({ item }: { item: Photo }) => (
      <Pressable
        style={styles.cell}
        onPress={() => setSelected((current) => (current === item.id ? null : item.id))}>
        <Image
          source={{ uri: item.uri }}
          style={[styles.image, item.id === selected && styles.imageSelected]}
          contentFit="cover"
          transition={120}
          placeholder={{ blurhash: undefined }}
          placeholderContentFit="cover"
          // Keeps the grid readable before the network resolves, so the scroll behaviour can be
          // tested offline too.
          backgroundColor={item.tint}
        />
      </Pressable>
    ),
    [selected]
  );

  return (
    <View style={styles.root}>
      <FlashList
        data={PHOTOS}
        numColumns={COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
      />

      <MaterialTopAppBar title="Gallery" variant="medium" scrollBehavior="exitUntilCollapsed" />

      <MaterialToolbar.Root
        placement="bottom"
        insets="safe"
        scrollBehavior="exitAlways"
        expanded={selected !== null}
        style={styles.toolbar}>
        <MaterialToolbar.Content>
          <MaterialToolbar.IconButton id="share" accessibilityLabel="Share">
            <MaterialToolbar.Icon fallback="initial" />
          </MaterialToolbar.IconButton>
          <MaterialToolbar.IconButton id="album" accessibilityLabel="Add to album">
            <MaterialToolbar.Icon fallback="initial" />
          </MaterialToolbar.IconButton>
          <MaterialToolbar.IconButton id="delete" accessibilityLabel="Delete">
            <MaterialToolbar.Icon fallback="initial" />
          </MaterialToolbar.IconButton>
        </MaterialToolbar.Content>
        <MaterialToolbar.Fab accessibilityLabel="Edit" onPress={() => setSelected(null)}>
          <MaterialToolbar.Icon fallback="initial" />
        </MaterialToolbar.Fab>
      </MaterialToolbar.Root>

      {selected ? (
        <View pointerEvents="none" style={styles.badge}>
          <Text style={styles.badgeText}>1 selected</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12141a' },
  // No top padding: the app bar reserves its own space natively through the scroll source.
  listContent: { paddingBottom: 96 },
  cell: { flex: 1 / COLUMNS, aspectRatio: 1, padding: 1 },
  image: { flex: 1, borderRadius: 2 },
  imageSelected: { borderRadius: 14 },
  toolbar: { marginBottom: 56 },
  badge: {
    position: 'absolute',
    bottom: 130,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#00000099',
  },
  badgeText: { color: 'white', fontSize: 12 },
});
