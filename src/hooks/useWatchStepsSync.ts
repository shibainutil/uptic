import { useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onWatchDays, readWatchDays, watchStepsSupported } from '../lib/garminSteps';
import { saveStepDay } from '../store/stepsStore';

const syncedKey = (uid: string) => `watchSteps.synced.${uid}`;

/**
 * Copies the step totals the watch sent (kept by the native module, also while the app
 * was closed) to Firestore: right away, whenever the watch sends more while the app is
 * open, and when the app comes back. Only changed days are written. Mounted at the root.
 */
export function useWatchStepsSync(userId: string | null | undefined) {
  useEffect(() => {
    if (!watchStepsSupported || !userId) return;
    let running = false;
    let again = false;

    const sync = async () => {
      if (running) { again = true; return; }
      running = true;
      try {
        do {
          again = false;
          let synced: Record<string, string> = {};
          try { synced = JSON.parse((await AsyncStorage.getItem(syncedKey(userId))) ?? '{}'); } catch { synced = {}; }
          for (const d of readWatchDays()) {
            const sig = `${d.steps}|${d.metres}|${d.kcal}`;
            if (synced[d.date] === sig) continue;
            await saveStepDay(userId, d);
            synced[d.date] = sig;
          }
          await AsyncStorage.setItem(syncedKey(userId), JSON.stringify(synced));
        } while (again);
      } catch (e) {
        console.warn('Watch steps sync failed', e);
      } finally {
        running = false;
      }
    };

    sync();
    const off = onWatchDays(sync);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') sync(); });
    return () => { off(); sub.remove(); };
  }, [userId]);
}
