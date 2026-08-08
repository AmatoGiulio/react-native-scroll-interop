import { Tabs } from 'expo-router';
import { Text } from 'react-native';

/**
 * Three tabs, all mounted at once.
 *
 * That is the point, not a detail: with every tab's list alive at the same time, an inactive
 * screen's list must never be able to drive the visible screen's chrome. If source ownership is
 * wrong, this layout is where it shows.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#5E81AC',
      }}>
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
  );
}

function TabGlyph({ color, glyph }: { color: string; glyph: string }) {
  return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
}
