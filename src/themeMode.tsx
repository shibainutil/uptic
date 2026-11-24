import { useEffect, useState, type ComponentType } from 'react';
import { Appearance, DevSettings } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { applyThemeMode, themeMode, type ThemeMode } from './theme';

const STORAGE_KEY = 'uptic.themeMode';

/** Native widgets (alerts, keyboard, pickers) follow the app's mode, not the phone's. */
function applyNative(mode: ThemeMode) {
  try { Appearance.setColorScheme(mode); } catch {}
}

/**
 * Root component registered in index.ts. Reads the saved mode, fills `colors`, and only
 * then requires the router entry, so every screen's StyleSheet is built with the right
 * palette. Renders nothing meanwhile (the splash screen stays up).
 */
export function ThemeGate() {
  const [App, setApp] = useState<ComponentType | null>(null);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .catch(() => null)
      .then((saved) => {
        const mode: ThemeMode = saved === 'light' ? 'light' : 'dark';
        applyThemeMode(mode);
        applyNative(mode);
        if (cancelled) return;
        const entry = require('expo-router/build/qualified-entry') as { App: ComponentType };
        setApp(() => entry.App);
      });
    return () => { cancelled = true; };
  }, []);
  return App ? <App /> : null;
}

/** Saves the other mode and reloads the JS bundle so all styles rebuild with it. */
export async function toggleThemeMode() {
  const next: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';
  await AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  applyNative(next);
  if (__DEV__) {
    DevSettings.reload();
  } else {
    await Updates.reloadAsync().catch(() => {
      // Updates disabled (e.g. web): fall back to a plain reload where available.
      DevSettings.reload();
    });
  }
}
