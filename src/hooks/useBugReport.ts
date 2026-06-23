import { useRef, useState, useCallback } from 'react';
import { PanResponder } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { usePathname } from 'expo-router';

const SWIPE_DOWN_THRESHOLD = 80;
const MIN_FINGERS = 3;

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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (_, gs) => gs.numberActiveTouches >= MIN_FINGERS,
      onMoveShouldSetPanResponderCapture: (_, gs) => gs.numberActiveTouches >= MIN_FINGERS,
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > SWIPE_DOWN_THRESHOLD && Math.abs(gs.dx) < 60) {
          trigger();
        }
      },
    })
  ).current;

  return { viewShotRef, panResponder, state, dismiss, currentScreen: pathname };
}
