import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * Reads weigh-ins from broadcast-only Bluetooth scales (OKOK / Chipsea style,
 * e.g. the unbranded "SMART SCALE" 918BT1). The scale never connects; it puts
 * each reading into the manufacturer data of its BLE advertisement:
 *
 *   company ID: 0x??C0 (low byte constant, high byte varies per packet)
 *   data[0..1]: weight in 0.1 kg, big-endian   (0x00C5 = 197 -> 19.7 kg)
 *   data[2..6]: flags / unknown
 *   data[7..12]: the scale's own MAC address
 *
 * The native side (modules/scale-reader) only forwards packets; all decoding
 * lives here so it can be adjusted without a new build.
 */

interface Advertisement {
  address: string;
  rssi: number;
  companyId: number;
  data: string; // hex
}

interface ScaleReaderNative {
  isBluetoothOn(): boolean;
  start(): void;
  stop(): void;
  addListener(event: 'onAdvertisement', cb: (e: Advertisement) => void): { remove(): void };
  addListener(event: 'onScanError', cb: (e: { code: number }) => void): { remove(): void };
}

const Native = Platform.OS === 'android' ? requireOptionalNativeModule<ScaleReaderNative>('ScaleReader') : null;

/** True when this app build includes the Bluetooth scale module. */
export const scaleSupported = !!Native;

/** Decode one advertisement into kg, or null if it isn't a scale reading. */
export function decodeScaleWeight(ad: Advertisement): number | null {
  const hex = ad.data;
  if (hex.length !== 26) return null; // 13 bytes
  // The payload ends with the scale's MAC; this rules out unrelated devices.
  const mac = ad.address.replace(/:/g, '').toUpperCase();
  if (hex.slice(14).toUpperCase() !== mac) return null;
  const raw = parseInt(hex.slice(0, 4), 16);
  if (!raw) return null;
  return raw / 10;
}

/** How long the same value must repeat before it counts as the final reading. */
const STABLE_MS = 1500;

export type ScaleStatus =
  | 'unsupported'   // app build has no scale module yet
  | 'permission'    // permission denied
  | 'bluetooth-off'
  | 'error'
  | 'waiting'       // scanning, no reading yet
  | 'measuring'     // reading arriving, still changing
  | 'stable';       // final reading

export interface ScaleState {
  status: ScaleStatus;
  kg: number | null;
  message?: string;
}

async function ensurePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const perms =
    (Platform.Version as number) >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(perms);
  return perms.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED);
}

/** Scan for the scale while `active` is true. */
export function useScaleReading(active: boolean): ScaleState & { retry: () => void } {
  const [state, setState] = useState<ScaleState>({ status: Native ? 'waiting' : 'unsupported', kg: null });
  const [attempt, setAttempt] = useState(0);
  const last = useRef<{ kg: number; since: number; address: string } | null>(null);

  useEffect(() => {
    if (!active || !Native) return;
    let cancelled = false;
    let subs: { remove(): void }[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    last.current = null;
    setState({ status: 'waiting', kg: null });

    (async () => {
      const ok = await ensurePermissions();
      if (cancelled) return;
      if (!ok) {
        setState({ status: 'permission', kg: null, message: 'Allow Nearby devices and Location to read the scale.' });
        return;
      }
      if (!Native.isBluetoothOn()) {
        setState({ status: 'bluetooth-off', kg: null, message: 'Turn on Bluetooth to read the scale.' });
        return;
      }
      subs = [
        Native.addListener('onAdvertisement', (ad) => {
          const kg = decodeScaleWeight(ad);
          if (kg == null) return;
          const now = Date.now();
          const prev = last.current;
          if (!prev || prev.kg !== kg || prev.address !== ad.address) {
            last.current = { kg, since: now, address: ad.address };
            clearTimeout(timer);
            // Promote to stable if no different value arrives in time.
            timer = setTimeout(() => {
              if (!cancelled && last.current?.kg === kg) setState({ status: 'stable', kg });
            }, STABLE_MS);
            setState({ status: 'measuring', kg });
          }
        }),
        Native.addListener('onScanError', ({ code }) => {
          setState({ status: 'error', kg: null, message: `Bluetooth scan failed (code ${code}).` });
        }),
      ];
      try {
        Native.start();
      } catch (e: any) {
        setState({ status: 'error', kg: null, message: e?.message ?? 'Could not start Bluetooth scan.' });
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      subs.forEach((s) => s.remove());
      try {
        Native.stop();
      } catch {}
    };
  }, [active, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
