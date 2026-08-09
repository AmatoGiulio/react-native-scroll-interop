import { Tabs } from 'expo-router';
import { MaterialToolbar } from 'expo-material-toolbar';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Three tabs, all mounted at once, plus the shared floating toolbar.
 *
 * The toolbar lives here rather than in each screen because it is navigation chrome: one instance
 * for the whole tab shell, mounted once, surviving tab switches. That is also the harder case for
 * the interop and the reason it is worth demonstrating — a single toolbar has to follow whichever
 * screen's list the user is currently scrolling, without ever being handed a ref to any of them.
 */
export default function TabsLayout() {
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          freezeOnBlur: false,
          lazy: true,
          animation: 'shift',
          sceneStyle: {
            backgroundColor: 'white',
          },
        }}
        tabBar={() => null}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Gallery',
            tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="▦" />,
          }}
        />
        <Tabs.Screen
          name="feed"
          options={{
            title: 'Feed',
            tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="▤" />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="◍" />,
          }}
        />
      </Tabs>

      <MaterialToolbar.Root
        placement="bottom"
        insets="none"
        scrollBehavior="exitAlways"
      >
        <MaterialToolbar.Content>
          <MaterialToolbar.IconButton id="search" accessibilityLabel="Search">
            <MaterialToolbar.Icon fallback="initial" />
          </MaterialToolbar.IconButton>
          <MaterialToolbar.IconButton id="filter" accessibilityLabel="Filter">
            <MaterialToolbar.Icon fallback="initial" />
          </MaterialToolbar.IconButton>
          <MaterialToolbar.IconButton id="sort" accessibilityLabel="Sort">
            <MaterialToolbar.Icon fallback="initial" />
          </MaterialToolbar.IconButton>
        </MaterialToolbar.Content>
        <MaterialToolbar.Fab accessibilityLabel="New album">
          <MaterialToolbar.Icon fallback="initial" />
        </MaterialToolbar.Fab>
      </MaterialToolbar.Root>
    </>
  );
}

function TabGlyph({ color, glyph }: { color: string; glyph: string }) {
  return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Sits above the tab bar. The toolbar host is a full-screen BOX_NONE overlay, so this only moves
  // the toolbar itself; touches elsewhere still reach the tabs and the lists underneath.
  toolbar: { marginBottom: 64 },
});
