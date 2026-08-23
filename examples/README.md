# Examples

Two repository-only consumer apps keep the currently maintained integration shapes visible and
reproducible.

- [`expo/`](./expo/) — Expo SDK 57 / React Native 0.86 consumer using the Expo config plugin and Expo Router integration.
- [`bare/`](./bare/) — bare React Native 0.87 consumer using standard React Native autolinking and the bare compatibility adapter.

The Expo app is the visual reference demo. Its Material3 chrome demonstrates native participation
in the real Android transaction; it is not the identity of the library. Recorded compatibility
evidence remains narrower than the set of versions represented by these repository examples.

Neither example is included in the npm package. These examples do not establish support for
FlatList, FlashList, LegendList, or arbitrary virtualized-list sources.
