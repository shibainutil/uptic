import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useWeightEntries } from '../store/weightStore';
import { syncWeightToHealth } from '../lib/healthConnect';

/**
 * Writes the signed-in user's weight entries to Health Connect whenever they change,
 * and again when the app comes back (permission may have just been granted).
 * Mounted once, at the app root.
 */
export function useWeightHealthSync(userId: string | null | undefined) {
  const { entries, loaded } = useWeightEntries(userId);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setActive((n) => n + 1); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !userId || !loaded) return;
    syncWeightToHealth(userId, entries).catch((e) => console.warn('Health Connect weight sync failed', e));
  }, [userId, loaded, entries, active]);
}
