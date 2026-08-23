import { Color } from 'expo-router';
import { useColorScheme } from 'react-native';

/** Material 3 roles resolved by Android from the user's current wallpaper and system theme. */
export const material3Dynamic = Color.android.dynamic;

/** Keep Android dynamic Material colors in sync when the system appearance changes. */
export function useMaterial3DynamicTheme() {
  useColorScheme();
  return material3Dynamic;
}
