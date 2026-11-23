import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { MaterialIcons } from '@expo/vector-icons';

export type BottomBarAction = {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
};

/** The action button a screen shows on the right of the bottom bar, if any. */
export const useBottomBarStore = create<{ action: BottomBarAction | null; setAction: (a: BottomBarAction | null) => void }>((set) => ({
  action: null,
  setAction: (action) => set({ action }),
}));

/** Shows a button on the right of the bottom bar while the calling screen is mounted. */
export function useBottomBarAction(label: string, icon: BottomBarAction['icon'], onPress: () => void) {
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  useEffect(() => {
    const { setAction } = useBottomBarStore.getState();
    setAction({ label, icon, onPress: () => onPressRef.current() });
    return () => setAction(null);
  }, [label, icon]);
}
