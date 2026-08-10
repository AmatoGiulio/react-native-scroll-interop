import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { MaterialScrollProbe, MaterialTopAppBar } from 'expo-material-toolbar';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PHOTOS, type Photo } from '../../src/photos';
import { ZoomIn } from 'react-native-reanimated';

const COLUMNS = 3;

/**
 * Gallery: FlashList image grid.
 *
 * The screen owns only its own app bar. The floating toolbar is tab-shell chrome and lives in
 * `(tabs)/_layout.tsx`; this list drives it anyway, because the coordinator picks the active scroll
 * source natively. There is no `onScroll` handler here and no ref is handed to either.
 */
export default function GalleryScreen() {
	const [selected, setSelected] = useState<string | null>(null);

	const renderItem = useCallback(
		({ item }: { item: Photo }) => (
			<Pressable
				style={styles.cell}
				onPress={() => setSelected((current) => (current === item.id ? null : item.id))}
			>
				<Image
					source={{ uri: item.uri }}
					style={[styles.image, item.id === selected && styles.imageSelected]}
					contentFit="cover"
					transition={120}
					placeholder={{ blurhash: undefined }}
					placeholderContentFit="cover"
				/>
			</Pressable>
		),
		[selected]
	);

	return (
		<View style={styles.root}>
			<MaterialScrollProbe style={{ flex: 1 }}>

				<FlashList
					data={PHOTOS}
					masonry
					numColumns={COLUMNS}
					keyExtractor={(item) => item.id}
					showsVerticalScrollIndicator={false}
					renderItem={renderItem}
				/>
			</MaterialScrollProbe>
			<MaterialTopAppBar title="Gallery" variant="large" scrollBehavior="exitUntilCollapsed" />
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	cell: { flex: 1 / COLUMNS, aspectRatio: 1, padding: 1 },
	image: { flex: 1, borderRadius: 8 },
	imageSelected: { borderRadius: 14 },
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
