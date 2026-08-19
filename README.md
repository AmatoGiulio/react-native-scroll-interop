# react-native-scroll-interop

Android-native scroll interoperability for React Native. The package exposes the **real synchronous Android nested-scroll transaction** to native UI while React Native remains the sole owner of touch handling, source position and fling physics.

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native UI consumers
```

Material3 is the first packaged consumer family:

- `MaterialTopAppBar` — Material3 TopAppBar PRE/POST consumer;
- `MaterialToolbar` — Material3 FloatingToolbar surface and POST observer;
- `react-native-scroll-interop/router` — optional Expo Router Stack adapter;
- `NativeScrollHost` — standalone/fallback native parent when no supported native screen owns the transaction.

There is no per-frame JS `onScroll` transport, sampled `scrollY` momentum reconstruction, parent-owned `OverScroller`, or parent `scrollBy` / `scrollTo` used to drive the source.

## Status

First public release candidate:

```text
react-native-scroll-interop@0.1.0-alpha.1
```

The current package line targets Expo SDK 57 + React Native 0.86.x. Android navigation-first integration is version-scoped to `react-native-screens 4.26.x` and fails closed outside that certified source shape.

The Expo Router navigation-first flow has been validated in the repository example on device. First npm publication remains blocked on the exact-tarball release gates, including React Navigation native-stack validation.

Native Material behavior is Android-only. On iOS and web, `react-native-scroll-interop/router` preserves Expo Router's existing native-stack behavior and Material components remain safe no-op/fallback surfaces.

See [`PRODUCT.md`](PRODUCT.md) for the product contract, [`ARCHITECTURE.md`](ARCHITECTURE.md) for native ownership, and [`RELEASE.md`](RELEASE.md) for release gates.

## Navigation-first model

Normal navigation screens do **not** need `NativeScrollHost`.

```text
Expo Router / React Navigation
          ↓
react-native-screens Screen
          ↓
ReactNativeNestedScrollParentController
          ↓
plain RN ScrollView / FlatList / SectionList / compatible source
          ↓
real Android nested-scroll transaction
          ↓
Material3 consumers
```

Navigation chrome remains scoped separately:

```text
navigation layout
├── Stack
│   ├── route A -> MaterialTopAppBar
│   └── route B -> MaterialTopAppBar
└── persistent MaterialToolbar
```

`react-native-screens` owns native screen/content identity. The actual React Native nested-scroll target remains transaction authority. Navigation libraries select routes and chrome; they do not transport scroll position, velocity, momentum or frame updates.

`NativeScrollHost` remains available for standalone surfaces or environments where a supported native screen is not the nested-scroll parent.

## Expo Router SDK 57

Use the optional Stack adapter:

```tsx
import { Stack } from 'react-native-scroll-interop/router';
```

The JSX remains normal Expo Router `Stack` / `Stack.Screen`. Standard native-stack options stay primary; Android translates the supported semantics to Material3.

```tsx
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { MaterialToolbar } from 'react-native-scroll-interop';
import { Stack } from 'react-native-scroll-interop/router';

export default function Layout() {
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: 'Home',
            headerLargeTitle: true,
          }}
        />

        <Stack.Screen
          name="details"
          options={{
            title: 'Details',
            material3: {
              topAppBar: {
                variant: 'medium',
                scrollBehavior: 'enterAlways',
              },
            },
          }}
        />
      </Stack>

      <MaterialToolbar.Root
        placement="bottom"
        scrollBehavior="exitAlways"
        insets="none"
      >
        <MaterialToolbar.Content>
          <MaterialToolbar.TextButton
            id="home"
            accessibilityLabel="Home"
            onPress={() => router.replace('/')}
          >
            <MaterialToolbar.Text>Home</MaterialToolbar.Text>
          </MaterialToolbar.TextButton>
        </MaterialToolbar.Content>
      </MaterialToolbar.Root>
    </View>
  );
}
```

A route is plain React Native scroll content:

```tsx
import { FlatList } from 'react-native';

export default function HomeScreen() {
  return <FlatList data={items} renderItem={renderItem} />;
}
```

### Stack option mapping

On Android:

- `title` / string `headerTitle` -> Material TopAppBar title;
- `headerLargeTitle` or `headerLargeTitleEnabled` -> large TopAppBar;
- large TopAppBar defaults to `exitUntilCollapsed`;
- native-stack back state -> Material back `IconButton` -> existing `navigation.goBack()`;
- `headerBackVisible: false` hides the Material back affordance;
- `material3.topAppBar` configures Material-only behavior with no cross-platform native-stack equivalent;
- `material3.topAppBar: false` opts a screen back into the platform-native header.

Unsupported custom header options are not silently dropped. The adapter falls back to the platform-native Expo/React Navigation header for that screen/scope. An explicit `headerTransparent: false` is also treated as a native-header opt-out.

On iOS and web, the adapter strips the `material3` namespace and otherwise passes the existing Expo Router options through.

### Material3-only options

```tsx
<Stack.Screen
  name="details"
  options={{
    title: 'Details',
    material3: {
      topAppBar: {
        variant: 'medium',
        scrollBehavior: 'enterAlways',
        themeMode: 'system',
        dynamicColor: true,
        navigationAccessibilityLabel: 'Back',
      },
    },
  }}
/>
```

The adapter preserves Expo Router static APIs such as `Stack.Screen`, `Stack.Protected`, `Stack.Header`, `Stack.Title` and `Stack.Toolbar`. Explicit custom headers continue to belong to Expo Router and are not replaced by Material3 translation.

## React Navigation

`MaterialTopAppBar` itself remains navigation-library agnostic. React Navigation native stack can render it through the standard `header` option. With `reactNativeScreensInterop` enabled on the certified `react-native-screens 4.26.x` line, screen content can remain a plain React Native scroll source without `NativeScrollHost`.

```tsx
<Stack.Navigator screenOptions={{ headerTransparent: true }}>
  <Stack.Screen
    name="Home"
    component={HomeScreen}
    options={{
      header: () => (
        <MaterialTopAppBar
          placement="header"
          title="Home"
          variant="large"
          scrollBehavior="exitUntilCollapsed"
        />
      ),
    }}
  />

  <Stack.Screen
    name="Details"
    component={DetailsScreen}
    options={{
      header: ({ navigation, back }) => (
        <MaterialTopAppBar
          placement="header"
          title="Details"
          navigationIcon={back ? 'back' : 'none'}
          onNavigationPress={back ? () => navigation.goBack() : undefined}
        />
      ),
    }}
  />
</Stack.Navigator>
```

Declare one `MaterialToolbar.Root` outside the navigator when it should persist across that navigation scope. The exact-tarball React Navigation runtime gate is still required before first publication.

## Install

After the first public alpha is published:

```bash
npm install react-native-scroll-interop@next
```

Because this is a native module, use an Expo development build or another native build. Expo Go does not contain this module.

For an exact local release candidate before publication:

```bash
npm pack
npm install ./react-native-scroll-interop-0.1.0-alpha.1.tgz
```

### Expo SDK 57 / RN 0.86.x

For navigation-first Android usage enable both version-scoped patches:

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-scroll-interop",
        {
          "android": {
            "rn086AndroidXScroll": true,
            "reactNativeScreensInterop": true
          }
        }
      ]
    ]
  }
}
```

- `rn086AndroidXScroll` preserves the real AndroidX NON_TOUCH nested-scroll lifecycle for the RN 0.86.x ordinary non-paging ScrollView fling path;
- `reactNativeScreensInterop` makes the certified `react-native-screens 4.26.x` native `Screen` the real `NestedScrollingParent3` owner and delegates to the package controller.

Both patches are version/source-shape scoped and fail closed rather than applying a partial mutation.

If you only use standalone `NativeScrollHost`, the `reactNativeScreensInterop` patch is not required.

## `NativeScrollHost`

`NativeScrollHost` is the standalone/fallback integration surface:

```tsx
<NativeScrollHost style={{ flex: 1 }}>
  <ScrollView>{/* content */}</ScrollView>
</NativeScrollHost>
```

It discovers a supported vertical source and delegates the same nested-scroll lifecycle/transaction handling to `ReactNativeNestedScrollParentController`. It does not intercept the gesture, own a second scroller or become the source of physics.

Normal navigation-first screens on the certified `react-native-screens` path should not add this wrapper.

## `MaterialTopAppBar`

```tsx
<MaterialTopAppBar
  placement="header"
  title="Gallery"
  variant="large"
  scrollBehavior="exitUntilCollapsed"
  navigationIcon="back"
  onNavigationPress={goBack}
  themeMode="system"
  dynamicColor
/>
```

Placements:

```text
overlay | header
```

`overlay` is the standalone default. `header` is for custom navigator-header surfaces and owns normal-flow sizing plus the top safe inset.

Variants:

```text
small | medium | large
```

Scroll behaviors:

```text
none | enterAlways | exitUntilCollapsed
```

Navigation icons:

```text
none | back
```

The base component does not import a navigation library. The optional `/router` adapter is the only Expo Router-specific JavaScript surface.

The app bar is a true PRE/POST transaction participant and may consume real nested-scroll distance while Material changes native state.

## `MaterialToolbar`

```tsx
<MaterialToolbar.Root
  visible
  expanded
  orientation="horizontal"
  variant="standard"
  placement="bottom"
  insets="safe"
  scrollBehavior="exitAlways"
  themeMode="system"
>
  <MaterialToolbar.Content>
    <MaterialToolbar.TextButton id="home" accessibilityLabel="Home">
      <MaterialToolbar.Icon resource="ic_home" />
      <MaterialToolbar.Text>Home</MaterialToolbar.Text>
    </MaterialToolbar.TextButton>
  </MaterialToolbar.Content>

  <MaterialToolbar.Fab accessibilityLabel="Create">
    <MaterialToolbar.Icon resource="ic_add" />
  </MaterialToolbar.Fab>
</MaterialToolbar.Root>
```

Available compound elements:

```text
Root
Content
LeadingContent
TrailingContent
IconButton
TextButton
Icon
Text
Fab
```

`MaterialToolbar.Root` is an absolute overlay by default, which is suitable for persistent navigation-layout placement. Its scroll behavior observes the real `childConsumedY` POST distance and consumes zero list distance.

### Placement and insets

`placement`:

```text
top | center | bottom
```

Advanced `alignment`:

```text
topStart | topCenter | topEnd
centerStart | center | centerEnd
bottomStart | bottomCenter | bottomEnd
```

`insets="safe"` uses native safe drawing/window inset handling. `edgeOffset` adds a dp offset from the aligned edge.

### Toolbar imperative ref

```ts
export type MaterialToolbarRef = {
  show(): Promise<void>;
  hide(): Promise<void>;
  expand(): Promise<void>;
  collapse(): Promise<void>;
};
```

## Transaction ownership

For one vertical request:

```text
requested dy
  -> native PRE consumers
  -> React Native source moves its remainder
  -> native POST consumers
  -> native POST observers
  -> remaining
```

Conservation remains:

```text
requested = chromePre + childConsumed + chromePost + remaining
```

React Native owns gesture handling, list position, child movement, fling initiation and fling physics. Material owns Material chrome state and terminal snap behavior. A terminal Material settle uses zero velocity because the real fling distance has already arrived frame-by-frame through nested scrolling.

## Compatibility

Current release-candidate contract:

| Platform / stack | Status |
|---|---|
| Android | supported product target |
| Expo SDK 57 | package target; exact-tarball gate required before first publish |
| Expo Router SDK 57 | `/router` adapter + direct screen-owned runtime verified in repository example; exact-tarball gate still required |
| `react-native-screens 4.26.x` | version-scoped direct `Screen` integration target |
| React Navigation native stack | integration target; exact-tarball runtime gate still required |
| React Native 0.86.x | supported alpha line; AndroidX NON_TOUCH compatibility patch required |
| RN 0.87 native transport line | bare-host architecture certified; not yet package support |
| iOS / web | Expo Router adapter passes navigation through; native Material behavior not implemented |
| Expo Go | not supported; native development build required |

`peerDependencies` intentionally match the packaged release gate instead of advertising untested compatibility. `expo-router` is an optional peer because it is required only when importing `react-native-scroll-interop/router`.

## Package contents

The npm tarball is intentionally limited to runtime/product material. Generated Gradle caches/build output, examples, bare certification probes, internal scripts, CI configuration and repository-only handoff material are excluded.

Run:

```bash
npm run check
```

for native invariants, navigation-surface invariants, RN 0.86 compatibility, `react-native-screens` patch invariants and npm package-surface validation. `npm publish` also runs this gate through `prepublishOnly`.

## Android dependency

The native module currently builds against Material3 Compose:

```gradle
implementation 'androidx.compose.material3:material3:1.5.0-alpha17'
```

## License

MIT. See [`LICENSE`](LICENSE).
