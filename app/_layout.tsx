import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView, GestureDetector } from 'react-native-gesture-handler';
import ViewShot from 'react-native-view-shot';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { useBugReport } from '../src/hooks/useBugReport';
import BugReportModal from '../src/components/BugReportModal';

function RootNavigator() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const { viewShotRef, gesture, state, dismiss, currentScreen } = useBugReport();

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
    <GestureDetector gesture={gesture}>
      <ViewShot ref={viewShotRef} style={styles.fill} options={{ format: 'jpg', quality: 0.8 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="fitness/exercise/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="fitness/routine/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="fitness/routine-execution/[id]" options={{ presentation: 'card' }} />
        </Stack>
        <BugReportModal
          visible={state.visible}
          screenshotUri={state.screenshotUri}
          currentScreen={currentScreen}
          onClose={dismiss}
        />
      </ViewShot>
    </GestureDetector>
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
