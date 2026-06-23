import { useRef, useState, useCallback, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
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

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(MIN_FINGERS)
        .maxPointers(MIN_FINGERS)
        .onEnd((e) => {
          'worklet';
          if (e.translationY > SWIPE_DOWN_THRESHOLD && Math.abs(e.translationX) < 60) {
            trigger();
          }
        })
        .runOnJS(true),
    [trigger]
  );

  return { viewShotRef, gesture, state, dismiss, currentScreen: pathname };
}
