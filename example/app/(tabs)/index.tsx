import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { NativeScrollHost, MaterialTopAppBar } from 'react-native-scroll-interop';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PHOTOS, type Photo } from '../../src/photos';

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
				<View style={styles.image}></View>
				
			</Pressable>
		),
		[selected]
	);

	return (
		<View style={styles.root}>
			<NativeScrollHost style={{ flex: 1 }}>
				<FlashList
					data={PHOTOS}
					masonry
					numColumns={COLUMNS}
					keyExtractor={(item) => item.id}
					showsVerticalScrollIndicator={false}
					renderItem={renderItem}
				/>
			</NativeScrollHost>
			<MaterialTopAppBar title="Gallery" variant="large" scrollBehavior="exitUntilCollapsed" />
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	cell: { flex: 1 / COLUMNS, aspectRatio: 1, padding: 1 },
	image: { flex: 1, borderRadius: 8, backgroundColor: '#50304f' },
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
