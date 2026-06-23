import { useRef, useState, useCallback, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import ViewShot from 'react-native-view-shot';
import { usePathname } from 'expo-router';

const SWIPE_DOWN_THRESHOLD = 60;
const MIN_FINGERS = 3;

interface BugReportState {
  visible: boolean;
  screenshotUri: string | null;
}

function averageY(touches: { absoluteY: number }[]): number {
  return touches.reduce((sum, t) => sum + t.absoluteY, 0) / touches.length;
}

export function useBugReport() {
  const viewShotRef = useRef<ViewShot>(null);
  const pathname = usePathname();
  const [state, setState] = useState<BugReportState>({ visible: false, screenshotUri: null });

  // Tracks the starting Y of a 3-finger contact and whether we've already
  // fired for the current gesture, so a single swipe triggers exactly once.
  const startY = useRef<number | null>(null);
  const fired = useRef(false);

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

  // The screens below render ScrollViews that win normal Pan arbitration, so a
  // competing Pan never activates (it only ever reaches onBegin). Instead we use
  // manualActivation + the onTouches* callbacks, which deliver every touch event
  // regardless of who "wins" the gesture. We observe the touches directly and
  // fire when 3+ fingers move down past the threshold — no arbitration needed.
  // useMemo keeps the gesture object stable across renders.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(MIN_FINGERS)
        .maxPointers(5)
        .manualActivation(true)
        .runOnJS(true)
        .onTouchesDown((event) => {
          if (event.numberOfTouches >= MIN_FINGERS && startY.current === null) {
            startY.current = averageY(event.allTouches);
            fired.current = false;
          }
        })
        .onTouchesMove((event) => {
          if (fired.current || startY.current === null) return;
          if (event.numberOfTouches < MIN_FINGERS) return;
          const dy = averageY(event.allTouches) - startY.current;
          if (dy > SWIPE_DOWN_THRESHOLD) {
            fired.current = true;
            trigger();
          }
        })
        .onTouchesUp((event) => {
          // Reset once fewer than 3 fingers remain, ready for the next swipe.
          if (event.numberOfTouches < MIN_FINGERS) {
            startY.current = null;
            fired.current = false;
          }
        }),
    [trigger]
  );

  return { viewShotRef, panGesture, state, dismiss, currentScreen: pathname };
}
