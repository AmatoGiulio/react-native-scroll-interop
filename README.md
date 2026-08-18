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

Current public release line:

```text
react-native-scroll-interop@0.1.0-alpha.1
```

The package is released under the MIT license. Native behavior is Android-only. The JavaScript surface is safe to import on other platforms: Material components are no-op there and `NativeScrollHost` preserves normal container layout through a `View` fallback.

The current packaged compatibility gate is Expo SDK 57 + React Native 0.86.x. The neutral native architecture is additionally certified against the repository's RN 0.87 bare-host line, but that is not yet a package-level compatibility promise.

See [`PRODUCT.md`](PRODUCT.md) for the exact product contract, [`ARCHITECTURE.md`](ARCHITECTURE.md) for the native layering, and [`RELEASE.md`](RELEASE.md) for release operations.

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

For published alpha releases:

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

## Quick start

```tsx
import {
  MaterialToolbar,
  MaterialTopAppBar,
  NativeScrollHost,
} from 'react-native-scroll-interop';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export function Screen() {
  return (
    <View style={styles.root}>
      <NativeScrollHost style={styles.content}>
        <ScrollView>
          {Array.from({ length: 80 }, (_, index) => (
            <Text key={index}>Row {index + 1}</Text>
          ))}
        </ScrollView>
      </NativeScrollHost>

      <MaterialTopAppBar
        title="Inbox"
        variant="large"
        scrollBehavior="exitUntilCollapsed"
      />

      <MaterialToolbar.Root
        style={StyleSheet.absoluteFill}
        placement="bottom"
        scrollBehavior="exitAlways"
      >
        <MaterialToolbar.Content>
          <MaterialToolbar.IconButton id="home" accessibilityLabel="Home">
            <MaterialToolbar.Icon resource="ic_home" />
          </MaterialToolbar.IconButton>
        </MaterialToolbar.Content>
      </MaterialToolbar.Root>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});
```

The React Native source does not receive a package-specific `onScroll`, ref, velocity callback or imperative scrolling command.

## Compatibility

Current package-level alpha contract:

| Platform / stack | Status |
|---|---|
| Android | supported product target |
| Expo SDK 57 | supported alpha line |
| React Native 0.86.x | supported alpha line; config plugin required for AndroidX NON_TOUCH lifecycle |
| RN 0.87 native transport line | bare-host architecture certified; not yet package support |
| iOS / web native Material behavior | not implemented; JS fallbacks are safe |
| Expo Go | not supported; native development build required |

`peerDependencies` intentionally match the packaged release gate instead of advertising untested compatibility.

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

The app bar is a true transaction participant and may consume distance while Material changes its native state.

## `MaterialToolbar`

```tsx
<MaterialToolbar.Root
  style={StyleSheet.absoluteFill}
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

The npm tarball is intentionally limited to runtime/product material:

```text
android/
android-shared/
plugin/
src/
index.ts
app.plugin.js
expo-module.config.json
ARCHITECTURE.md
PRODUCT.md
LICENSE
README.md
package.json
```

Examples, bare certification probes, internal test scripts, CI configuration and repository-only handoff material are excluded from the package surface.

Run:

```bash
npm run check
```

for native invariants, the RN 0.86 plugin guard and npm package-surface validation. `npm publish` also runs this gate through `prepublishOnly`.

## Android dependency

The native module currently builds against Material3 Compose:

```gradle
implementation 'androidx.compose.material3:material3:1.5.0-alpha17'
```

## License

MIT. See [`LICENSE`](LICENSE).
