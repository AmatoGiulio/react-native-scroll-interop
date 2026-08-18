# react-native-scroll-interop

Android-native scroll interoperability for React Native. The package exposes the **real synchronous Android nested-scroll transaction** to native UI while React Native remains the sole owner of touch handling, source position and fling physics.

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native UI consumers
```

Material3 is the first packaged native consumer family:

- `NativeScrollHost` — native transaction host around a React Native vertical scroll source;
- `MaterialTopAppBar` — Material3 TopAppBar PRE/POST consumer;
- `MaterialToolbar` — Material3 FloatingToolbar surface and POST observer.

There is no per-frame JS `onScroll` transport, no sampled `scrollY` momentum reconstruction, no parent-owned `OverScroller`, and no parent `scrollBy` / `scrollTo` used to drive the list.

## Status

First public release candidate:

```text
react-native-scroll-interop@0.1.0-alpha.1
```

The package is not considered ready for its first npm publication until the navigation-first integration is validated with Expo Router and React Navigation.

Native behavior is Android-only. The JavaScript surface is safe to import on other platforms: Material components are no-op there and `NativeScrollHost` preserves normal container layout through a `View` fallback.

The current package line targets Expo SDK 57 + React Native 0.86.x. The neutral native architecture is additionally certified against the repository's RN 0.87 bare-host line, but that is not yet a package-level compatibility promise.

See [`PRODUCT.md`](PRODUCT.md) for the exact product contract, [`ARCHITECTURE.md`](ARCHITECTURE.md) for the native layering, and [`RELEASE.md`](RELEASE.md) for release operations.

## Navigation-first model

Native chrome belongs to navigation, not to every screen component.

```text
navigation layout
├── Stack
│   ├── route A -> MaterialTopAppBar
│   └── route B -> MaterialTopAppBar
└── persistent MaterialToolbar

route content
└── NativeScrollHost
    └── ScrollView / FlatList / SectionList / compatible vertical RN source
```

The TopAppBar is route chrome and should be declared through the navigator's custom-header API. The FloatingToolbar is layout chrome and should be declared once around the navigator. Screen components own their scroll content, not repeated copies of navigation chrome.

Navigation libraries are **not** used to transport scroll frames. They only decide which screen/header is active. The real Android nested-scroll target remains transaction authority.

## Expo Router SDK 57

Expo Router 57 supports a fully custom Stack header through `Stack.Header asChild`. Use a transparent header so the Material TopAppBar remains an overlay and the existing native scroll-away accounting owns content geometry.

`app/_layout.tsx`:

```tsx
import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';
import {
  MaterialToolbar,
  MaterialTopAppBar,
} from 'react-native-scroll-interop';

export default function Layout() {
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="index">
          <Stack.Header asChild transparent>
            <MaterialTopAppBar
              title="Home"
              variant="large"
              scrollBehavior="exitUntilCollapsed"
            />
          </Stack.Header>
        </Stack.Screen>

        <Stack.Screen name="details">
          <Stack.Header asChild transparent>
            <MaterialTopAppBar
              title="Details"
              variant="medium"
              scrollBehavior="enterAlways"
              navigationIcon="back"
              onNavigationPress={() => router.back()}
            />
          </Stack.Header>
        </Stack.Screen>
      </Stack>

      <MaterialToolbar.Root
        placement="bottom"
        scrollBehavior="exitAlways"
        insets="safe"
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

A screen contains only its scroll host/content:

```tsx
import { NativeScrollHost } from 'react-native-scroll-interop';
import { FlatList } from 'react-native';

export default function HomeScreen() {
  return (
    <NativeScrollHost style={{ flex: 1 }}>
      <FlatList data={items} renderItem={renderItem} />
    </NativeScrollHost>
  );
}
```

No `MaterialTopAppBar` or `MaterialToolbar` is repeated inside the screen.

## React Navigation

`MaterialTopAppBar` is navigation-library agnostic. React Navigation's native stack can render it through its standard custom `header` option while `headerTransparent: true` preserves the same overlay model:

```tsx
<Stack.Navigator
  screenOptions={{
    headerTransparent: true,
  }}
>
  <Stack.Screen
    name="Home"
    component={HomeScreen}
    options={{
      header: () => (
        <MaterialTopAppBar
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
          title="Details"
          navigationIcon={back ? 'back' : 'none'}
          onNavigationPress={back ? () => navigation.goBack() : undefined}
        />
      ),
    }}
  />
</Stack.Navigator>
```

Declare one `MaterialToolbar.Root` outside the navigator when the toolbar should persist across that navigation scope. React Navigation also provides `screenLayout` for apps that want to centralize per-screen wrappers such as `NativeScrollHost`; this is an optional navigation integration, not part of the scroll transport.

## Why this exists

A React Native list already owns its gesture and fling. Native chrome should not create a second scroll model just to react to it.

Instead, the list's real Android transaction is exposed to native UI:

```text
requested dy
  -> native PRE consumers
  -> React Native source moves its remainder
  -> native POST consumers
  -> native POST observers
  -> remaining
```

The accounting invariant is:

```text
requested = chromePre + childConsumed + chromePost + remaining
```

`MaterialTopAppBar` may consume real PRE/POST distance. `MaterialToolbar` observes the real child-consumed POST distance and consumes zero list distance.

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

Enable the version-scoped compatibility plugin:

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-scroll-interop",
        {
          "android": {
            "rn086AndroidXScroll": true
          }
        }
      ]
    ]
  }
}
```

Then regenerate/build Android as required by the consumer project.

## `NativeScrollHost`

Wrap the vertical React Native source that should drive native chrome:

```tsx
<NativeScrollHost style={{ flex: 1 }}>
  <ScrollView>{/* content */}</ScrollView>
</NativeScrollHost>
```

The actual nested-scroll target supplied by Android remains transaction authority. The host does not intercept the gesture and does not become the source of physics.

## `MaterialTopAppBar`

```tsx
<MaterialTopAppBar
  title="Gallery"
  variant="large"
  scrollBehavior="exitUntilCollapsed"
  navigationIcon="back"
  onNavigationPress={goBack}
  themeMode="system"
  dynamicColor
/>
```

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

The back affordance is rendered as a native Material3 `IconButton`; `onNavigationPress` is the navigation callback supplied by the host navigator. No navigation library is imported by the package.

The app bar is a true transaction participant and may consume distance while Material changes its native state.

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

`MaterialToolbar.Root` uses an absolute overlay by default, which makes it suitable for persistent placement in a navigation layout.

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

The toolbar uses real Material3 Compose controls. Its scroll behavior observes the source's actual `childConsumedY`; it does not remove list distance from Android transaction accounting.

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

`insets="safe"` uses native safe drawing/window inset handling. `edgeOffset` adds a dp offset from the aligned edge; omitted values use Material's native screen offset.

### Toolbar imperative ref

```ts
export type MaterialToolbarRef = {
  show(): Promise<void>;
  hide(): Promise<void>;
  expand(): Promise<void>;
  collapse(): Promise<void>;
};
```

## Compatibility

Current release-candidate contract:

| Platform / stack | Status |
|---|---|
| Android | supported product target |
| Expo SDK 57 | package target; navigation-first gate required before first publish |
| Expo Router SDK 57 | navigation-first integration target |
| React Navigation native stack | navigation-first integration target; release gate required before first publish |
| React Native 0.86.x | supported alpha line; config plugin required for AndroidX NON_TOUCH lifecycle |
| RN 0.87 native transport line | bare-host architecture certified; not yet package support |
| iOS / web native Material behavior | not implemented; JS fallbacks are safe |
| Expo Go | not supported; native development build required |

`peerDependencies` intentionally match the packaged release gate instead of advertising untested compatibility.

## Material and source ownership

Material is the source of truth for Material chrome state and terminal snap behavior.

React Native is the source of truth for:

- gesture handling;
- list position;
- child movement;
- fling initiation;
- fling physics.

A terminal Material settle uses zero velocity because the real fling distance has already arrived frame-by-frame through nested scrolling. Passing the fling velocity into Material a second time would integrate momentum twice.

## RN 0.86 compatibility

The RN 0.86 config plugin is narrow and version-scoped. For the ordinary non-paging `ReactNestedScrollView` fling path it delegates to AndroidX `NestedScrollView.fling()`, allowing AndroidX to emit the real typed NON_TOUCH nested-scroll lifecycle while React Native still owns the fling itself.

The plugin does not implement the transport, a second scroller or Material behavior.

## Package contents

The npm tarball is intentionally limited to runtime/product material. Generated Gradle caches/build output, examples, bare certification probes, internal scripts, CI configuration and repository-only handoff material are excluded.

Run:

```bash
npm run check
```

for native invariants, navigation-surface invariants, the RN 0.86 plugin guard and npm package-surface validation. `npm publish` also runs this gate through `prepublishOnly`.

## Android dependency

The native module currently builds against Material3 Compose:

```gradle
implementation 'androidx.compose.material3:material3:1.5.0-alpha17'
```

## License

MIT. See [`LICENSE`](LICENSE).
