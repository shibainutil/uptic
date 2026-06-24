import { useRef, useState, useCallback } from 'react';
import { GestureResponderEvent } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { usePathname } from 'expo-router';

const SWIPE_DOWN_THRESHOLD = 60;
const MIN_FINGERS = 3;

interface BugReportState {
  visible: boolean;
  screenshotUri: string | null;
}

function averageY(touches: { pageY: number }[]): number {
  return touches.reduce((sum, t) => sum + t.pageY, 0) / touches.length;
}

export function useBugReport() {
  const viewShotRef = useRef<ViewShot>(null);
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
      // screenshot optional — proceed without it
    }
    setState({ visible: true, screenshotUri: uri });
  }, []);

  const dismiss = useCallback(() => {
    setState({ visible: false, screenshotUri: null });
  }, []);

  // Raw RN touch events instead of a gesture-handler Pan. RNGH's Pan loses
  // arbitration to the child ScrollViews (it gets cancelled ~2ms after the 3rd
  // finger lands, before any move), and the manualActivation workaround depends
  // on worklets that aren't reliable here (Reanimated 4, no babel config). These
  // onTouch* events fire on the JS thread and bubble to this ancestor view even
  // while a descendant ScrollView is the responder — no arbitration involved.
  const onTouchStart = useCallback((e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    console.log('[BugReport] touchStart n=', touches.length);
    if (touches.length >= MIN_FINGERS && startY.current === null) {
      startY.current = averageY(touches);
      fired.current = false;
      console.log('[BugReport] armed, startY=', Math.round(startY.current));
    }
  }, []);

  const onTouchMove = useCallback((e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    if (fired.current || startY.current === null || touches.length < MIN_FINGERS) return;
    const dy = averageY(touches) - startY.current;
    console.log('[BugReport] move n=', touches.length, 'dy=', Math.round(dy));
    if (dy > SWIPE_DOWN_THRESHOLD) {
      fired.current = true;
      console.log('[BugReport] FIRING trigger');
      trigger();
    }
  }, [trigger]);

  const onTouchEnd = useCallback((e: GestureResponderEvent) => {
    if (e.nativeEvent.touches.length < MIN_FINGERS) {
      startY.current = null;
      fired.current = false;
    }
  }, []);

  const rootTouchHandlers = { onTouchStart, onTouchMove, onTouchEnd };

  return { viewShotRef, rootTouchHandlers, state, dismiss, currentScreen: pathname };
}
