# Migration from 1.x tab-style API

The 2.x alpha removes the custom tab/navigation API entirely. Route state remains in Expo Router and each Material action owns its press handler.

Before:

```tsx
<MaterialToolbar.Root
  value={selectedTab}
  onValueChange={handleTabChange}
  colors={{
    selectedContainer: theme.colors.chrome.tabIndicator,
    selectedContent: theme.colors.text.primary,
    unselectedContent: theme.colors.text.secondary,
  }}
>
  <MaterialToolbar.Bar>
    <MaterialToolbar.Item value="index">
      <MaterialToolbar.Label>Home</MaterialToolbar.Label>
    </MaterialToolbar.Item>
  </MaterialToolbar.Bar>
</MaterialToolbar.Root>
```

After, using the real toolbar content model:

```tsx
<MaterialToolbar.Root
  style={StyleSheet.absoluteFill}
  visible={tabsFocused}
  orientation="horizontal"
  placement="bottom"
  insets="safe"
  imeBehavior="hide"
  variant="standard"
  colors={{
    toolbarContainer: theme.colors.surface,
    toolbarContent: theme.colors.text.primary,
    fabContainer: theme.colors.chrome.tabIndicator,
    fabContent: theme.colors.text.primary,
  }}
>
  <MaterialToolbar.Content>
    <MaterialToolbar.IconButton
      id="index"
      accessibilityLabel="Home"
      onPress={() => handleTabChange('index')}
    >
      <MaterialToolbar.Icon
        resource={selectedTab === 'index' ? 'ic_home_filled' : 'ic_home'}
      />
    </MaterialToolbar.IconButton>

    <MaterialToolbar.IconButton
      id="schedario"
      accessibilityLabel="Schedario"
      onPress={() => handleTabChange('schedario')}
    >
      <MaterialToolbar.Icon resource="ic_archive" />
    </MaterialToolbar.IconButton>

    <MaterialToolbar.IconButton
      id="cassa"
      accessibilityLabel="Cassa"
      onPress={() => handleTabChange('cassa')}
    >
      <MaterialToolbar.Icon resource="ic_payments" />
    </MaterialToolbar.IconButton>

    <MaterialToolbar.IconButton
      id="account"
      accessibilityLabel="Profilo"
      onPress={() => handleTabChange('account')}
    >
      <MaterialToolbar.Icon source={accountSource} tint="none" />
    </MaterialToolbar.IconButton>
  </MaterialToolbar.Content>

  <MaterialToolbar.Fab accessibilityLabel="Cerca" onPress={handleOpenSearch}>
    <MaterialToolbar.Icon
      source={require('./assets/search.png')}
      tint="content"
    />
  </MaterialToolbar.Fab>
</MaterialToolbar.Root>
```

For toolbar-visible text use `TextButton` + `Text`. There is no toolbar-level selected-item state.

`useKeyboardState()` is unnecessary when `imeBehavior="hide"` is used. `useSafeAreaInsets()` is unnecessary for toolbar placement when the native root fills the relevant screen bounds and `insets="safe"` is enabled.
