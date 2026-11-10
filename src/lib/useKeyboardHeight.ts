import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export interface KeyboardFrame {
  /** Keyboard height in px, 0 when hidden. */
  height: number;
  /** Screen y of the keyboard's top edge (meaningful only while height > 0). */
  top: number;
}

/** Current on-screen keyboard frame. Android needs the 'Did' event pair. */
export function useKeyboardFrame(): KeyboardFrame {
  const [frame, setFrame] = useState<KeyboardFrame>({ height: 0, top: 0 });

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => setFrame({
      height: e.endCoordinates.height,
      top: e.endCoordinates.screenY,
    }));
    const hideSub = Keyboard.addListener(hideEvent, () => setFrame({ height: 0, top: 0 }));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return frame;
}

/** Current on-screen keyboard height in px, 0 when hidden. */
export function useKeyboardHeight(): number {
  return useKeyboardFrame().height;
}
