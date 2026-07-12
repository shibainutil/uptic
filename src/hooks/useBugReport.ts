import { useRef, useState, useCallback, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import { usePathname } from 'expo-router';

const SWIPE_DOWN_THRESHOLD = 50;
const MIN_FINGERS = 3;

interface BugReportState {
  visible: boolean;
  screenshotUri: string | null;
}

function averageY(touches: { absoluteY: number }[]): number {
  return touches.reduce((sum, t) => sum + t.absoluteY, 0) / touches.length;
}

export function useBugReport() {
  const viewShotRef = useRef<ViewShotRef>(null);
  const pathname = usePathname();
  const [state, setState] = useState<BugReportState>({ visible: false, screenshotUri: null });

  const startY = useRef<number | null>(null);
  const fired = useRef(false);

  const trigger = useCallback(async () => {
    let uri: string | null = null;
    try {
      if (viewShotRef.current?.capture) {
        uri = await viewShotRef.current.capture();
      }
    } catch {
      // screenshot optional
    }
    setState({ visible: true, screenshotUri: uri });
  }, []);

  const dismiss = useCallback(() => {
    setState({ visible: false, screenshotUri: null });
  }, []);

  // Gesture.Manual() + stateManager.begin() is the key:
  //   - Pan().manualActivation(true) stays in UNDETERMINED until activated, and
  //     RNGH does not deliver onTouchesMove in UNDETERMINED state (observed in logs:
  //     touchesDown fires but touchesMove never does).
  //   - Manual() + begin() explicitly transitions to BEGAN, which enables move delivery.
  const gesture = useMemo(
    () =>
      Gesture.Manual()
        .runOnJS(true)
        .onTouchesDown((event, stateManager) => {
          console.log('[BugReport] touchesDown n=', event.numberOfTouches);
          if (event.numberOfTouches >= MIN_FINGERS && startY.current === null) {
            startY.current = averageY(event.allTouches);
            fired.current = false;
            stateManager.begin(); // transition to BEGAN so onTouchesMove starts firing
            console.log('[BugReport] armed + began, startY=', Math.round(startY.current));
          }
        })
        .onTouchesMove((event, stateManager) => {
          if (fired.current || startY.current === null) return;
          if (event.numberOfTouches < MIN_FINGERS) return;
          const dy = averageY(event.allTouches) - startY.current;
          console.log('[BugReport] move n=', event.numberOfTouches, 'dy=', Math.round(dy));
          if (dy > SWIPE_DOWN_THRESHOLD) {
            fired.current = true;
            stateManager.activate();
            console.log('[BugReport] FIRING');
            trigger();
          }
        })
        .onTouchesUp((event, stateManager) => {
          if (event.numberOfTouches < MIN_FINGERS) {
            stateManager.end();
            startY.current = null;
            fired.current = false;
          }
        }),
    [trigger]
  );

  return { viewShotRef, gesture, state, dismiss, currentScreen: pathname };
}
