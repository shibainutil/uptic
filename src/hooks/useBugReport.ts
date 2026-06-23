import { useRef, useState, useCallback } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import ViewShot from 'react-native-view-shot';
import { usePathname } from 'expo-router';

const SWIPE_DOWN_THRESHOLD = 80;

interface BugReportState {
  visible: boolean;
  screenshotUri: string | null;
}

export function useBugReport() {
  const viewShotRef = useRef<ViewShot>(null);
  const pathname = usePathname();
  const [state, setState] = useState<BugReportState>({ visible: false, screenshotUri: null });

  const trigger = useCallback(async () => {
    let uri: string | null = null;
    try {
      if (viewShotRef.current?.capture) {
        uri = await viewShotRef.current.capture();
      }
    } catch {
      // screenshot optional — proceed without it
    }
    setState({ visible: true, screenshotUri: uri });
  }, []);

  const dismiss = useCallback(() => {
    setState({ visible: false, screenshotUri: null });
  }, []);

  const panGesture = Gesture.Pan()
    .minPointers(3)
    .runOnJS(true)
    .onEnd((event) => {
      if (event.translationY > SWIPE_DOWN_THRESHOLD && Math.abs(event.translationX) < 60) {
        trigger();
      }
    });

  return { viewShotRef, panGesture, state, dismiss, currentScreen: pathname };
}
