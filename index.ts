// Same as 'expo-router/entry', except the root waits for the saved dark/light mode before
// loading the router (see src/themeMode.tsx). `@expo/metro-runtime` must stay first.
import '@expo/metro-runtime';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { ThemeGate } from './src/themeMode';

renderRootComponent(ThemeGate);
