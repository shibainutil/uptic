import { useEffect } from 'react';
import { LogBox, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { colors, themeMode } from '../src/theme';
import { useDevReconnect } from '../src/lib/devReconnect';
import { useHabitNotifications } from '../src/hooks/useHabitNotifications';
import { useWeightHealthSync } from '../src/hooks/useWeightHealthSync';
import { useWatchStepsSync } from '../src/hooks/useWatchStepsSync';

// react-native-draggable-flatlist's nested lists (NestableDraggableFlatList inside
// NestableScrollContainer) call measureLayout against the animated outer ScrollView,
// which the new architecture warns about on every render. Dragging works fine; this
// only silences the dev-only red toast.
LogBox.ignoreLogs(['ref.measureLayout must be called with a ref to a native component']);

// LogBox only hides the on-screen toast; Metro's terminal still prints every console
// error/warning. Drop the two known library-originated dev messages there too
// (the measureLayout one above, and "InteractionManager has been deprecated", which
// comes from expo-router's stack Card and react-native-draggable-flatlist, not our code).
if (__DEV__) {
  const NOISE = [
    'ref.measureLayout must be called with a ref to a native component',
    'InteractionManager has been deprecated',
  ];
  for (const level of ['error', 'warn'] as const) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && NOISE.some((m) => (args[0] as string).includes(m))) return;
      original(...args);
    };
  }
}

function RootNavigator() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  useDevReconnect(!loading && !!user);
  useHabitNotifications(user?.uid);
  useWeightHealthSync(user?.uid);
  useWatchStepsSync(user?.uid);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)/home');
    }
  }, [user, loading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="fitness/exercise/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="fitness/routine/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="fitness/routine-execution/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="habits/habit/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="habits/entries/[habitId]" options={{ presentation: 'card' }} />
      <Stack.Screen name="about" options={{ presentation: 'card' }} />
      <Stack.Screen name="notifications" options={{ presentation: 'card' }} />
      <Stack.Screen name="settings" options={{ presentation: 'card' }} />
      <Stack.Screen name="pillars/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="pillars/edit/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="projects/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="projects/edit/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="projects/milestone/[id]" options={{ presentation: 'card' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <AuthProvider>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
});
