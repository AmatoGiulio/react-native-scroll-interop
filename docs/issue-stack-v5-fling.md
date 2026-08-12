# Draft issue for react-native-screens — review before posting

> Not published. Text below is ready to paste into
> https://github.com/software-mansion/react-native-screens/issues/new

---

**Title:** `[Android] Stack v5 collapsing header does not move during fling momentum`

---

### Description

On Android, a Stack v5 header with scroll flags follows the finger correctly, but stops responding
the moment the finger lifts. Whatever distance the list covers under momentum does not reach the
header.

The effect is easy to miss with slow gestures — the header finishes its travel while the finger is
still down — and very visible with a quick flick, where the list travels thousands of pixels and the
header stays where the finger left it.

### Steps to reproduce

Added as a screen in this repository's example app (`apps/`), using the same configuration as
`test-stack-svm-lift-on-scroll`:

```tsx
// apps/src/tests/single-feature-tests/FlingHeaderTest.tsx
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { StackContainer, type StackRouteConfig } from '@apps/shared/containers/stack';
import { ScrollViewMarker } from 'react-native-screens';

const ROWS = Array.from({ length: 400 }, (_, index) => index);

function ListScreen() {
  return (
    <ScrollViewMarker>
      <FlatList
        nestedScrollEnabled
        data={ROWS}
        keyExtractor={item => String(item)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowText}>{item}</Text>
          </View>
        )}
      />
    </ScrollViewMarker>
  );
}

const ROUTE_CONFIGS: StackRouteConfig[] = [
  {
    name: 'flingHeader',
    Component: ListScreen,
    options: {
      headerConfig: {
        title: 'Fling test',
        android: {
          type: 'small',
          scrollFlagScroll: true,
          scrollFlagEnterAlways: true,
        },
      },
    },
  },
];

export default function FlingHeaderTest() {
  return (
    <View style={styles.container}>
      <StackContainer routeConfigs={ROUTE_CONFIGS} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', height: '100%' },
  row: {
    height: 96,
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 12,
    backgroundColor: '#4C6EF5',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  rowText: { color: 'white', fontSize: 34, fontWeight: '700' },
});
```

Then, from the top of the list, flick quickly with a short gesture and watch the header while the
list keeps scrolling.

### Measurements

`enterAlways` on a `small` header gives roughly 168px of travel: fully shown at `y=231`, fully
hidden at `y=63` (measured from screenshots). Because that range is smaller than most gestures, the
shorter and faster the gesture, the larger the share of the movement that momentum has to carry.

Each row below starts from the top of the list, and both values are read **at rest**, after all
motion has stopped:

| gesture | how far the list ended up | header position |
|---|---|---|
| 1200px drag, slow (no fling) | 3 rows | **63** — fully hidden |
| 150px finger / 60ms | 1 row | 105 |
| 120px finger / 40ms | 4 rows | 140 |
| 100px finger / 25ms | **28 rows** | **179** — barely moved |

The relationship is inverse and monotonic: the more of the travel that momentum performs, the
**less** the header moves. In the last row the list covers roughly 3000px and the header moves 52px
out of 168 — while a slow drag over a much shorter distance hides it completely.

(The row number is the first row present in the view hierarchy via `uiautomator dump`, so it is a
monotonic indicator of position rather than an exact pixel measurement.)

### Environment

- `react-native-screens`: this repository at `main` (`edaabbb`), running `FabricExample`
- React Native 0.87.0-rc.3, New Architecture
- Android emulator, API 36 (`Medium_Phone_API_36.1`)
- Also observed with 4.26.2 and 4.27.0 from npm

### Possible cause, and the actual question

Header collapse is driven by `dispatchNestedPreScroll` bubbling to `CoordinatorLayout` and on to
`AppBarLayout.Behavior`. On Android `ReactScrollView` extends `android.widget.ScrollView`, which
does not dispatch nested scroll per frame while its fling runs — so there would be nothing to
forward during momentum.

If that is the cause, it looks like the same gap addressed by
[facebook/react-native#44099](https://github.com/facebook/react-native/pull/44099) and later
[#55239](https://github.com/facebook/react-native/pull/55239), which lets `ReactScrollView` extend
`NestedScrollView` behind the `useNestedScrollViewAndroid` feature flag — `NestedScrollView` does
dispatch during fling as `TYPE_NON_TOUCH`.

So the question is really: **has the header been tested with `useNestedScrollViewAndroid` enabled,
and is that the intended path for this?** If so, it might be worth documenting the current
limitation until that flag is on by default.

Happy to test any patch on this setup.
