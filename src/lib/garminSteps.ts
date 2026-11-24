import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * Step totals sent by the "Uptic Steps" watch app (watch/) straight from the Garmin
 * watch's own counter, received by the native module (modules/garmin-steps), which also
 * writes them to Health Connect. Builds without the module report unsupported.
 */

export interface WatchDay {
  date: string;   // YYYY-MM-DD, local
  steps: number;
  metres: number;
  kcal: number;   // total calories (resting + active), as the watch counts them
}

interface GarminStepsNative {
  getDays(): string;
  getStatus(): { ready: boolean; error: string | null; lastAt: number };
  writeHealth(): Promise<void>;
  addListener(event: 'onDays', cb: (e: { json: string }) => void): { remove(): void };
}

const Native = Platform.OS === 'android' ? requireOptionalNativeModule<GarminStepsNative>('GarminSteps') : null;

export const watchStepsSupported = !!Native;

/** Every day the watch has sent, newest first. */
export function readWatchDays(): WatchDay[] {
  if (!Native) return [];
  try {
    const all = JSON.parse(Native.getDays()) as Record<string, { s: number; m: number; c: number }>;
    return Object.entries(all)
      .map(([date, v]) => ({ date, steps: v.s ?? 0, metres: v.m ?? 0, kcal: v.c ?? 0 }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

/** Called whenever the watch sends new totals while the app is running. */
export function onWatchDays(cb: () => void): () => void {
  if (!Native) return () => {};
  const sub = Native.addListener('onDays', () => cb());
  return () => sub.remove();
}

export function watchStatus() {
  return Native?.getStatus() ?? null;
}

/** Write all stored days to Health Connect again, e.g. right after write permission was granted. */
export function rewriteWatchDaysToHealth(): Promise<void> {
  return Native?.writeHealth() ?? Promise.resolve();
}
