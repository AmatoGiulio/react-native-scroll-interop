import { Color } from 'expo-router';
import { Platform, useColorScheme } from 'react-native';

function resolveColors() {
  return {
    background: Platform.select({
      ios: Color.ios.systemBackground,
      android: Color.android.dynamic.surface,
      default: '#f8f9ff',
    })!,
    surface: Platform.select({
      ios: Color.ios.secondarySystemBackground,
      android: Color.android.dynamic.surfaceContainer,
      default: '#eff1f8',
    })!,
    surfaceLow: Platform.select({
      ios: Color.ios.tertiarySystemBackground,
      android: Color.android.dynamic.surfaceContainerLow,
      default: '#f4f5fb',
    })!,
    pressed: Platform.select({
      ios: Color.ios.systemGray5,
      android: Color.android.dynamic.surfaceContainerHigh,
      default: '#e6e8f0',
    })!,
    text: Platform.select({
      ios: Color.ios.label,
      android: Color.android.dynamic.onSurface,
      default: '#1a1b20',
    })!,
    muted: Platform.select({
      ios: Color.ios.secondaryLabel,
      android: Color.android.dynamic.onSurfaceVariant,
      default: '#45464f',
    })!,
    outline: Platform.select({
      ios: Color.ios.separator,
      android: Color.android.dynamic.outlineVariant,
      default: '#c6c6d0',
    })!,
    accent: Platform.select({
      ios: Color.ios.systemBlue,
      android: Color.android.dynamic.primary,
      default: '#4f5fbb',
    })!,
    accentContainer: Platform.select({
      ios: Color.ios.systemGray6,
      android: Color.android.dynamic.primaryContainer,
      default: '#dfe2ff',
    })!,
    onAccent: Platform.select({
      ios: Color.ios.systemBackground,
      android: Color.android.dynamic.onPrimary,
      default: '#ffffff',
    })!,
    onAccentContainer: Platform.select({
      ios: Color.ios.label,
      android: Color.android.dynamic.onPrimaryContainer,
      default: '#07164b',
    })!,
  };
}

/** Re-render Android screens when the system appearance changes. */
export function useDemoColors() {
  useColorScheme();
  return resolveColors();
}
