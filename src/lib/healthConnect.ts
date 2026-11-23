import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, TurboModuleRegistry } from 'react-native';

/**
 * Android Health Connect: the phone's shared health store. Garmin Connect writes
 * steps, distance and calories here after each watch sync, so Uptic reads them
 * from Health Connect instead of talking to the watch. Garmin does not export
 * water to Health Connect, so water is logged in Uptic itself (see waterStore).
 *
 * The native module only exists in app builds made after it was added, so the
 * library is loaded lazily: older builds report "unsupported" instead of crashing.
 */

type HC = typeof import('react-native-health-connect');

let lib: HC | null | undefined;
function hc(): HC | null {
  if (lib !== undefined) return lib;
  lib = null;
  if (Platform.OS === 'android' && TurboModuleRegistry.get('HealthConnect')) {
    try {
      lib = require('react-native-health-connect') as HC;
    } catch {
      lib = null;
    }
  }
  return lib;
}

/** True when this app build includes Health Connect support. */
export const healthConnectSupported = (): boolean => !!hc();

const READ_PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
] as const;

export type HealthStatus =
  | 'unsupported'      // this app build has no Health Connect module
  | 'unavailable'      // Health Connect missing on the phone
  | 'update-required'  // Health Connect app needs an update
  | 'no-permission'    // available, Uptic not allowed to read steps yet
  | 'connected';

let initialized = false;

async function ensureInit(): Promise<HC | null> {
  const m = hc();
  if (!m) return null;
  if (!initialized) initialized = await m.initialize();
  return initialized ? m : null;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const m = hc();
  if (!m) return 'unsupported';
  const sdk = await m.getSdkStatus();
  if (sdk === m.SdkAvailabilityStatus.SDK_UNAVAILABLE) return 'unavailable';
  if (sdk === m.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update-required';
  await ensureInit();
  const granted = await m.getGrantedPermissions();
  const canReadSteps = granted.some(
    (p: any) => p.recordType === 'Steps' && p.accessType === 'read',
  );
  return canReadSteps ? 'connected' : 'no-permission';
}

/** Shows the Health Connect permission screen. Returns the new status. */
export async function connectHealth(): Promise<HealthStatus> {
  const m = await ensureInit();
  if (!m) return getHealthStatus();
  await m.requestPermission(READ_PERMISSIONS as any);
  return getHealthStatus();
}

export function openHealthSettings() {
  hc()?.openHealthConnectSettings();
}

/** Keeps the Health Connect status fresh, re-checking when the app comes back to the foreground. */
export function useHealthStatus() {
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const refresh = useCallback(() => {
    getHealthStatus().then(setStatus).catch(() => setStatus('unavailable'));
  }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);
  const connect = useCallback(async () => {
    try {
      setStatus(await connectHealth());
    } catch {
      refresh();
    }
  }, [refresh]);
  return { status, refresh, connect };
}

// ── Reading ────────────────────────────────────────────────────────────────

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export interface DayActivity {
  date: string;          // YYYY-MM-DD, local
  steps: number;
  distanceKm: number;
  activeKcal: number;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Only Garmin Connect's data counts. Other apps write steps too (Google Fit counts the
 * phone's own steps), and Health Connect's aggregate merges every source, which adds
 * steps the watch never counted.
 */
const GARMIN_CONNECT = 'com.garmin.android.apps.connectmobile';

async function aggregateDay(m: HC, day: Date): Promise<DayActivity> {
  const start = startOfDay(day);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
  const safe = <T,>(p: Promise<T>) => p.catch(() => null);
  const [steps, dist, cal] = await Promise.all([
    safe(m.aggregateRecord({ recordType: 'Steps', timeRangeFilter, dataOriginFilter: [GARMIN_CONNECT] })),
    safe(m.aggregateRecord({ recordType: 'Distance', timeRangeFilter, dataOriginFilter: [GARMIN_CONNECT] })),
    safe(m.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter, dataOriginFilter: [GARMIN_CONNECT] })),
  ]);
  return {
    date: ymd(start),
    steps: steps?.COUNT_TOTAL ?? 0,
    distanceKm: dist?.DISTANCE?.inKilometers ?? 0,
    activeKcal: cal?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0,
  };
}

/** Steps, distance and active calories for the last `days` days, newest first. */
export async function readActivity(days: number): Promise<DayActivity[]> {
  const m = await ensureInit();
  if (!m) return [];
  const today = startOfDay(new Date());
  const list = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    return d;
  });
  return Promise.all(list.map((d) => aggregateDay(m, d)));
}
