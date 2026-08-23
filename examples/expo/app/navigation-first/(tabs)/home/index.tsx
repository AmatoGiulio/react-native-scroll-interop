import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { material3Dynamic as colors, useMaterial3DynamicTheme } from '../../../../theme';

const COLLECTIONS = [
  {
    label: 'Albums',
    images: [
      'https://picsum.photos/seed/albums-1/240/240',
      'https://picsum.photos/seed/albums-2/240/240',
      'https://picsum.photos/seed/albums-3/240/240',
      'https://picsum.photos/seed/albums-4/240/240',
    ],
  },
  {
    label: 'Documents',
    images: [
      'https://picsum.photos/seed/documents-1/240/240',
      'https://picsum.photos/seed/documents-2/240/240',
      'https://picsum.photos/seed/documents-3/240/240',
      'https://picsum.photos/seed/documents-4/240/240',
    ],
  },
  {
    label: 'Places',
    images: ['https://images.unsplash.com/photo-1526772662000-3f88f10405ff?auto=format&fit=crop&w=700&q=85'],
  },
  {
    label: 'Moments',
    images: ['https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=700&q=85'],
  },
] as const;

const LIST_ITEMS = [
  { label: 'Screenshots', androidIcon: 'image', iosIcon: 'photo' },
  { label: 'Videos', androidIcon: 'play_circle', iosIcon: 'play.circle' },
  { label: 'Recently Added', androidIcon: 'history', iosIcon: 'clock' },
  { label: "Sonu's photos", androidIcon: 'person', iosIcon: 'person.crop.circle' },
  { label: 'Archive', androidIcon: 'archive', iosIcon: 'archivebox' },
  { label: 'Locked', androidIcon: 'lock', iosIcon: 'lock' },
] as const;

export default function NavigationFirstHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  useMaterial3DynamicTheme();

  const horizontalPadding = 20;
  const gridGap = 14;
  const tileWidth = (width - horizontalPadding * 2 - gridGap) / 2;
  const collageInset = 8;
  const collageGap = 5;
  const collageCell = (tileWidth - collageInset * 2 - collageGap) / 2;

  const openItem = (label: string) => {
    router.push({
      pathname: '/navigation-first/detail-item',
      params: { row: label, source: 'Collections' },
    });
  };

  return (
    <ScrollView
      style={styles.host}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
    >
      <View style={[styles.topBar, { paddingTop: insets.top, minHeight: 56 + insets.top }]}> 
        <View style={styles.backupState}>
          <Text style={styles.backupText}>Backed up</Text>
          <Text style={styles.backupCheck}>✓</Text>
        </View>

        <View style={styles.topActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Create" hitSlop={10}>
            <SymbolView
              name={{ ios: 'plus', android: 'add', web: 'add' }}
              size={28}
              tintColor={colors.onSurfaceVariant}
            />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Notifications" hitSlop={10}>
            <SymbolView
              name={{ ios: 'bell.slash', android: 'notifications_off', web: 'notifications_off' }}
              size={24}
              tintColor={colors.onSurfaceVariant}
            />
          </Pressable>
          <View style={styles.avatar} accessibilityLabel="Profile">
            <Text style={styles.avatarText}>G</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <View style={[styles.collectionGrid, { columnGap: gridGap }]}>
          {COLLECTIONS.map((collection) => (
            <Pressable
              key={collection.label}
              accessibilityRole="button"
              accessibilityLabel={collection.label}
              onPress={() => openItem(collection.label)}
              style={({ pressed }) => [
                styles.collectionTile,
                { width: tileWidth },
                pressed && styles.pressed,
              ]}
            >
              {collection.images.length === 1 ? (
                <Image
                  source={{ uri: collection.images[0] }}
                  style={[styles.singleImage, { width: tileWidth, height: tileWidth }]}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    styles.collage,
                    {
                      width: tileWidth,
                      height: tileWidth,
                      padding: collageInset,
                      gap: collageGap,
                    },
                  ]}
                >
                  {collection.images.map((uri) => (
                    <Image
                      key={uri}
                      source={{ uri }}
                      style={{ width: collageCell, height: collageCell, borderRadius: 12 }}
                      resizeMode="cover"
                    />
                  ))}
                </View>
              )}
              <Text style={styles.collectionLabel}>{collection.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.list}>
          {LIST_ITEMS.map((item, index) => (
            <View key={item.label}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => openItem(item.label)}
                style={({ pressed }) => [styles.listRow, pressed && styles.rowPressed]}
              >
                <View style={styles.iconSlot}>
                  <SymbolView
                    name={{ ios: item.iosIcon, android: item.androidIcon, web: item.androidIcon }}
                    size={27}
                    tintColor={colors.onSurfaceVariant}
                  />
                </View>
                <Text style={styles.listLabel}>{item.label}</Text>
              </Pressable>
              {index < LIST_ITEMS.length - 1 ? <View style={styles.divider} /> : null}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingBottom: 150,
  },
  topBar: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
  },
  backupState: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backupText: {
    color: colors.onSurface,
    fontSize: 17,
    fontWeight: '500',
  },
  backupCheck: {
    color: colors.onSurfaceVariant,
    fontSize: 18,
    fontWeight: '600',
  },
  topActions: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondaryContainer,
  },
  avatarText: {
    color: colors.onSecondaryContainer,
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 20,
  },
  collectionTile: {
    gap: 9,
  },
  collage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerLow,
  },
  singleImage: {
    borderRadius: 24,
    backgroundColor: colors.surfaceContainerLow,
  },
  collectionLabel: {
    paddingLeft: 5,
    color: colors.onSurface,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400',
  },
  pressed: {
    opacity: 0.78,
  },
  list: {
    marginTop: 28,
  },
  listRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 17,
    paddingHorizontal: 8,
    borderRadius: 18,
  },
  rowPressed: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  iconSlot: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listLabel: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '400',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 8,
    backgroundColor: colors.outlineVariant,
  },
});
