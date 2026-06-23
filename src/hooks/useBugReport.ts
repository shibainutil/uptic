import { useRef, useState, useCallback, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import ViewShot from 'react-native-view-shot';
import { usePathname } from 'expo-router';

const SWIPE_DOWN_THRESHOLD = 60;

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

  // useMemo so the gesture object is stable across renders — recreating it
  // every render causes RNGH to lose the active gesture state.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(3)
        .maxPointers(5)
        .activeOffsetY(10)
        .runOnJS(true)
        .onEnd((event) => {
          if (event.translationY > SWIPE_DOWN_THRESHOLD) {
            trigger();
          }
        }),
    [trigger]
  );

  return { viewShotRef, panGesture, state, dismiss, currentScreen: pathname };
}
