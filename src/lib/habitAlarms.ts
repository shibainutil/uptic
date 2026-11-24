import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * Uptic's own Android scheduler for habit notifications (modules/habit-alarms): exact
 * alarms it owns, notifications that replace each other per habit session (same tag), and
 * Skip / Done buttons. Nothing here depends on expo-notifications' internals.
 */

export interface AlarmItem {
  id: string;
  /** Notifications with the same tag replace each other: one per habit session. */
  tag: string;
  at: number;
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string | null;
  /** JSON, handed back with Skip / Done. */
  data: string;
}

export interface AlarmAction { id: string; action: 'done' | 'skip'; data: string; at: number }

interface HabitAlarmsNative {
  replaceAll(itemsJson: string): string[];
  scheduled(): string;
  show(itemJson: string): void;
  presented(): string;
  dismiss(id: string): void;
  takeActions(): string;
  canScheduleExact(): boolean;
  addListener(event: 'onAction', cb: (e: { json: string }) => void): { remove(): void };
}

const Native = Platform.OS === 'android' ? requireOptionalNativeModule<HabitAlarmsNative>('HabitAlarms') : null;

export const habitAlarmsSupported = !!Native;

/** Make these the only scheduled alarms. Returns the ids of earlier ones that were missed. */
export function replaceAllAlarms(items: AlarmItem[]): string[] {
  return Native?.replaceAll(JSON.stringify(items)) ?? [];
}

export function scheduledAlarms(): { id: string; at: number }[] {
  try { return Native ? JSON.parse(Native.scheduled()) : []; } catch { return []; }
}

export function showAlarmNow(item: AlarmItem) {
  Native?.show(JSON.stringify(item));
}

export function presentedAlarms(): { id: string; data: string }[] {
  try { return Native ? JSON.parse(Native.presented()) : []; } catch { return []; }
}

/** Takes the notification down only while that exact one is showing for its session. */
export function dismissAlarm(id: string) {
  Native?.dismiss(id);
}

/** Skip / Done presses made while the app wasn't running. */
export function takeAlarmActions(): AlarmAction[] {
  try { return Native ? JSON.parse(Native.takeActions()) : []; } catch { return []; }
}

export function onAlarmAction(cb: (a: AlarmAction) => void): () => void {
  if (!Native) return () => {};
  const sub = Native.addListener('onAction', (e) => {
    try { cb(JSON.parse(e.json)); } catch { /* ignore malformed */ }
  });
  return () => sub.remove();
}
