import { useEffect } from 'react';
import { LogBox, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

// react-native-draggable-flatlist's nested lists (NestableDraggableFlatList inside
// NestableScrollContainer) call measureLayout against the animated outer ScrollView,
// which the new architecture warns about on every render. Dragging works fine; this
// only silences the dev-only red toast.
LogBox.ignoreLogs(['ref.measureLayout must be called with a ref to a native component']);

function RootNavigator() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)/fitness');
    }
  }, [user, loading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="fitness/exercise/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="fitness/routine/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="fitness/routine-execution/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="habits/habit/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="habits/entries/[habitId]" options={{ presentation: 'card' }} />
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
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
