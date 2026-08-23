import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" hidden={false} translucent />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
