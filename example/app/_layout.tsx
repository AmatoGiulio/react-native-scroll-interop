import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      {/* The Material app bar draws its own status-bar inset natively, so the RN status bar stays
          translucent and the header owns that region. */}
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="delayed-source" />
        <Stack.Screen name="plain-scroll-control" />
      </Stack>
    </>
  );
}
