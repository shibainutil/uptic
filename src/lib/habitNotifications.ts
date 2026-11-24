import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { addDays, fromISO } from './schedule';
import { DUE_WINDOW_MIN, sessionSlots, type SessionSlot } from './habitSchedule';
import { isHabitComplete, totalSessions, type Habit, type HabitLogEntry } from '../types/habits';
import {
  dismissAlarm, habitAlarmsSupported, presentedAlarms, replaceAllAlarms, showAlarmNow, type AlarmItem,
} from './habitAlarms';

// One notification per session: "Due" fires DUE_WINDOW_MIN before the session, "Overdue"
// DUE_WINDOW_MIN after it. They are scheduled ahead so they arrive with the app closed.
//
// On Android, Uptic's own scheduler (modules/habit-alarms) shows both phases of a session
// under one notification tag, so Android itself replaces "Due" with "Overdue", also while
// the app is closed, and Skip / Done cancel the session's remaining alarm. Elsewhere
// (iOS) expo-notifications is used, and the Due one is dismissed whenever the app runs.

export const HABIT_CATEGORY = 'habit-session';
export const ACTION_DONE = 'habit-done';
export const ACTION_SKIP = 'habit-skip';
const CHANNEL = 'habits';
const KIND = 'habit-session';
const DAYS_AHEAD = 2;   // today plus the next two days
const MAX_SCHEDULED = 60; // iOS keeps at most 64 pending local notifications

export const notificationsSupported = Platform.OS !== 'web';
const useNative = habitAlarmsSupported;

export type Phase = 'due' | 'overdue';

export interface HabitNotificationData {
  kind: typeof KIND;
  habitId: string;
  slotKey: string;
  date: string;
  time: string;
  phase: Phase;
  at: number;
  [key: string]: unknown;
}

export const notificationId = (habitId: string, slotKey: string, phase: Phase) =>
  `habit|${habitId}|${slotKey}|${phase}`;

/** One tag per session: its Due and Overdue notifications replace each other. */
const sessionTag = (habitId: string, slotKey: string) => `habit|${habitId}|${slotKey}`;

export function parseHabitData(d: unknown): HabitNotificationData | undefined {
  const x = d as Partial<HabitNotificationData> | undefined;
  return x?.kind === KIND && x.habitId && x.slotKey ? (x as HabitNotificationData) : undefined;
}

export function habitData(n: Notifications.NotificationRequest | undefined): HabitNotificationData | undefined {
  return parseHabitData(n?.content.data);
}

interface Planned { id: string; tag: string; at: number; title: string; body: string; data: HabitNotificationData }

function planned(habit: Habit, slot: Pick<SessionSlot, 'key' | 'date' | 'time'>, phase: Phase, at: number): Planned {
  const data: HabitNotificationData = {
    kind: KIND, habitId: habit.id, slotKey: slot.key, date: slot.date, time: slot.time, phase, at,
  };
  // Android can't colour notification text, so the status carries a coloured circle:
  // blue for Due, orange for Overdue, like the Habits screen.
  const status = phase === 'due' ? '🔵 Due' : '🟠 Overdue';
  const date = fromISO(slot.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    id: notificationId(habit.id, slot.key, phase),
    tag: sessionTag(habit.id, slot.key),
    at,
    title: `${habit.name} · ${status}`,
    body: `${date} · ${slot.time}`,
    data,
  };
}

function slotMoment(slot: Pick<SessionSlot, 'date' | 'time'>): number {
  const [h, m] = slot.time.split(':').map(Number);
  const d = fromISO(slot.date);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

const phaseMoment = (slot: Pick<SessionSlot, 'date' | 'time'>, phase: Phase) =>
  slotMoment(slot) + (phase === 'due' ? -1 : 1) * DUE_WINDOW_MIN * 60_000;

/** Every Due / Overdue notification still to come for unhandled sessions, earliest first. */
export function planHabitNotifications(habits: Habit[], entries: HabitLogEntry[], today: string, now: Date): Planned[] {
  const out: Planned[] = [];
  const until = addDays(today, DAYS_AHEAD);
  const nowMs = now.getTime();
  for (const habit of habits) {
    if (habit.archived) continue;
    const mine = entries.filter((e) => e.habitId === habit.id);
    if (isHabitComplete(habit, totalSessions(mine), today)) continue;
    for (const slot of sessionSlots(habit, entries, today, until, now)) {
      if (slot.date < today || slot.date > until) continue;
      if (slot.status === 'done' || slot.status === 'skipped' || slot.status === 'paused' || slot.extra) continue;
      for (const phase of ['due', 'overdue'] as Phase[]) {
        const when = phaseMoment(slot, phase);
        if (when <= nowMs) continue;
        out.push(planned(habit, slot, phase, when));
      }
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_SCHEDULED);
}

// ── Backends ───────────────────────────────────────────────────────────────

interface Shown { id: string; data: HabitNotificationData }

/** The deep link a tapped notification opens: that habit's entries. */
function entriesUrl(habitId: string): string | null {
  const scheme = Constants.expoConfig?.scheme;
  const s = Array.isArray(scheme) ? scheme[0] : scheme;
  return s ? `${s}://habits/entries/${habitId}` : null;
}

function toAlarm(p: Planned): AlarmItem {
  return { id: p.id, tag: p.tag, at: p.at, title: p.title, body: p.body, url: entriesUrl(p.data.habitId), data: JSON.stringify(p.data) };
}

function toExpoContent(p: Planned): Notifications.NotificationContentInput {
  return { title: p.title, body: p.body, data: p.data, categoryIdentifier: HABIT_CATEGORY, sound: 'default' };
}

async function presented(): Promise<Shown[]> {
  if (useNative) {
    return presentedAlarms().flatMap((n) => {
      let data: HabitNotificationData | undefined;
      try { data = parseHabitData(JSON.parse(n.data)); } catch { data = undefined; }
      return data ? [{ id: n.id, data }] : [];
    });
  }
  const list = await Notifications.getPresentedNotificationsAsync();
  return list.flatMap((n) => {
    const data = habitData(n.request);
    return data ? [{ id: n.request.identifier, data }] : [];
  });
}

async function dismiss(id: string) {
  if (useNative) dismissAlarm(id);
  else await Notifications.dismissNotificationAsync(id).catch(() => {});
}

/** Show now. On Android the session's earlier notification is replaced (same tag). */
async function showNow(p: Planned) {
  if (useNative) {
    showAlarmNow(toAlarm(p));
    return;
  }
  if (p.data.phase === 'overdue') await dismiss(notificationId(p.data.habitId, p.data.slotKey, 'due'));
  await Notifications.scheduleNotificationAsync({ identifier: p.id, content: toExpoContent(p), trigger: { channelId: CHANNEL } });
}

/**
 * Make the plan the set of scheduled notifications. Returns ids of earlier ones that were
 * missed (their moment passed and they never showed), so catch-up can post them.
 */
async function schedule(plan: Planned[], open: Map<string, SessionSlot>, now: Date): Promise<string[]> {
  if (useNative) {
    // Every alarm is set again each time, so ones the system dropped come back.
    return replaceAllAlarms(plan.map(toAlarm));
  }
  return scheduleWithExpo(plan, open, now);
}

const MISSED_AFTER_MS = 2 * 60_000;
let rearmNext = true; // first sync of every app process

/** Re-create every OS alarm on the next sync (call when the app comes to the foreground). */
export function rearmHabitNotifications() {
  rearmNext = true;
}

async function scheduleWithExpo(plan: Planned[], open: Map<string, SessionSlot>, now: Date): Promise<string[]> {
  const wanted = new Map(plan.map((p) => [p.id, p]));
  const missed: string[] = [];
  let scheduled = await Notifications.getAllScheduledNotificationsAsync();
  // Alarms scheduled by an older native build are kept as they are by the matching below,
  // so re-create all of them once per build.
  const version = `${Application.nativeApplicationVersion}|${Application.nativeBuildVersion}|exact1`;
  const rescheduleAll = (await AsyncStorage.getItem(SCHEDULE_VERSION_KEY)) !== version;
  if (rescheduleAll) {
    for (const req of scheduled) {
      if (habitData(req)) await Notifications.cancelScheduledNotificationAsync(req.identifier);
    }
    scheduled = [];
  }
  // A force-stop wipes the OS alarms but not expo's list, so re-arm on start / return.
  const rearm = rearmNext || rescheduleAll;
  rearmNext = false;
  const have = new Set<string>();
  for (const req of scheduled) {
    const d = habitData(req);
    if (!d) continue;
    if (d.at < now.getTime() - MISSED_AFTER_MS) {
      missed.push(req.identifier);
      await Notifications.cancelScheduledNotificationAsync(req.identifier).catch(() => {});
      continue;
    }
    const want = wanted.get(req.identifier);
    const same = want && want.at === d.at && want.title === req.content.title && want.body === req.content.body;
    if (same && !rearm) { have.add(req.identifier); continue; }
    if (same) continue; // re-armed below under the same id
    const firing = d.at <= now.getTime() + 10_000 && open.has(`${d.habitId}|${d.slotKey}`);
    if (!firing) await Notifications.cancelScheduledNotificationAsync(req.identifier);
  }
  for (const p of plan) {
    if (have.has(p.id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: toExpoContent(p),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL },
    });
  }
  if (rescheduleAll) await AsyncStorage.setItem(SCHEDULE_VERSION_KEY, version);
  return missed;
}

/** Android, once: drop habit notifications left over from the expo-notifications days. */
async function migrateFromExpo() {
  if (!useNative || (await AsyncStorage.getItem(MIGRATED_KEY))) return;
  try {
    for (const req of await Notifications.getAllScheduledNotificationsAsync()) {
      if (habitData(req)) await Notifications.cancelScheduledNotificationAsync(req.identifier).catch(() => {});
    }
    for (const n of await Notifications.getPresentedNotificationsAsync()) {
      if (habitData(n.request)) await Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
    }
    await AsyncStorage.setItem(MIGRATED_KEY, '1');
  } catch (e) {
    console.warn('Habit notifications migration failed', e);
  }
}

// ── Setup and sync ─────────────────────────────────────────────────────────

let setupDone: Promise<boolean> | undefined;

/** Permission, and (off Android) the expo channel and Skip / Done buttons. Runs once. */
export function setupHabitNotifications(): Promise<boolean> {
  if (!notificationsSupported) return Promise.resolve(false);
  setupDone ??= (async () => {
    if (!useNative) {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL, {
          name: 'Habit sessions',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      await Notifications.setNotificationCategoryAsync(HABIT_CATEGORY, [
        { identifier: ACTION_SKIP, buttonTitle: '✕ Skip', options: { opensAppToForeground: false, isDestructive: true } },
        { identifier: ACTION_DONE, buttonTitle: '✓ Done', options: { opensAppToForeground: false } },
      ]);
    }
    await migrateFromExpo();
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current : await Notifications.requestPermissionsAsync();
    return status.granted;
  })().catch((e) => {
    setupDone = undefined;
    console.warn('Habit notifications setup failed', e);
    return false;
  });
  return setupDone;
}

/**
 * Bring scheduled notifications in line with the plan, and clear presented ones that no
 * longer apply: a handled session's, or a Due one whose session has turned Overdue.
 */
async function syncOnce(habits: Habit[], entries: HabitLogEntry[], today: string, now: Date) {
  const plan = planHabitNotifications(habits, entries, today, now);
  const open = openSessions(habits, entries, today, now);

  const shown = new Set<string>();
  for (const n of await presented()) {
    const slot = open.get(`${n.data.habitId}|${n.data.slotKey}`);
    if (!slot || (n.data.phase === 'due' && slot.status === 'overdue')) await dismiss(n.id);
    else shown.add(n.id);
  }

  try {
    const posted = await loadPosted(today);
    const missed = await schedule(plan, open, now);
    // Missed ones never showed: let catch-up post the session's notification now.
    for (const id of missed) delete posted[id];
    // Scheduled with the OS: they fire on their own, so catch-up must never post them again.
    for (const p of plan) posted[p.id] = p.data.date;
    await catchUp(habits, open, shown, posted, today);
    await AsyncStorage.setItem(POSTED_KEY, JSON.stringify(posted));
  } catch (e) {
    console.warn('Habit notifications scheduling failed', e);
  }
}

let syncing: Promise<void> | undefined;
let nextSync: (() => Promise<void>) | undefined;

/** Runs one sync at a time; while one runs, only the latest request is kept and runs next. */
export function syncHabitNotifications(habits: Habit[], entries: HabitLogEntry[], today: string, now: Date): Promise<void> {
  nextSync = () => syncOnce(habits, entries, today, now);
  syncing ??= (async () => {
    while (nextSync) {
      const run = nextSync;
      nextSync = undefined;
      await run().catch((e) => console.warn('Habit notifications sync failed', e));
    }
    syncing = undefined;
  })();
  return syncing;
}

/**
 * Sessions still open, by "habitId|slotKey". As on the Habits screen, unhandled sessions
 * older than the latest handled one are treated as abandoned.
 */
function openSessions(habits: Habit[], entries: HabitLogEntry[], today: string, now: Date) {
  const open = new Map<string, SessionSlot>();
  for (const habit of habits) {
    if (habit.archived) continue;
    if (isHabitComplete(habit, totalSessions(entries.filter((e) => e.habitId === habit.id)), today)) continue;
    const slots = sessionSlots(habit, entries, today, addDays(today, DAYS_AHEAD), now);
    const lastHandled = slots.filter((s) => s.date <= today && (s.status === 'done' || s.status === 'skipped')).at(-1)?.key ?? '';
    for (const s of slots) {
      const unhandled = s.status === 'today' || s.status === 'overdue' || s.status === 'later' || s.status === 'upcoming';
      if (unhandled && s.key > lastHandled) open.set(`${habit.id}|${s.key}`, s);
    }
  }
  return open;
}

export interface SessionNotification { habit: Habit; slot: SessionSlot; phase: Phase; at: number }

/** The notifications that apply right now: today's and yesterday's Due / Overdue sessions. */
export function currentHabitNotifications(habits: Habit[], entries: HabitLogEntry[], today: string, now: Date): SessionNotification[] {
  const yesterday = addDays(today, -1);
  const out: SessionNotification[] = [];
  for (const [key, slot] of openSessions(habits, entries, today, now)) {
    if (slot.date < yesterday || (slot.status !== 'today' && slot.status !== 'overdue')) continue;
    const habit = habits.find((h) => key.startsWith(`${h.id}|`));
    if (!habit) continue;
    const phase: Phase = slot.status === 'overdue' ? 'overdue' : 'due';
    out.push({ habit, slot, phase, at: phaseMoment(slot, phase) });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Every notification still scheduled with the OS, earliest first. */
export function upcomingHabitNotifications(habits: Habit[], entries: HabitLogEntry[], today: string, now: Date): SessionNotification[] {
  const open = openSessions(habits, entries, today, now);
  return planHabitNotifications(habits, entries, today, now).flatMap((p) => {
    const habit = habits.find((h) => h.id === p.data.habitId);
    const slot = open.get(`${p.data.habitId}|${p.data.slotKey}`);
    return habit && slot ? [{ habit, slot, phase: p.data.phase, at: p.at }] : [];
  });
}

/** Show a session's notification on the phone now (replacing its earlier one, if any). */
export async function showHabitNotification(n: SessionNotification) {
  await setupHabitNotifications();
  await showNow(planned(n.habit, n.slot, n.phase, n.at));
}

const POSTED_KEY = 'habitNotifications.posted';
const SCHEDULE_VERSION_KEY = 'habitNotifications.scheduleVersion';
const MIGRATED_KEY = 'habitNotifications.nativeMigrated';

/**
 * Sessions that are already Due or Overdue (today's and yesterday's) but whose
 * notification never showed (it was missed, or the app wasn't set up yet) get one now.
 * Each session phase is posted once, so swiping it away keeps it away.
 */
async function loadPosted(today: string): Promise<Record<string, string>> {
  let posted: Record<string, string> = {};
  try { posted = JSON.parse((await AsyncStorage.getItem(POSTED_KEY)) ?? '{}'); } catch { posted = {}; }
  // Forget sessions older than yesterday.
  const yesterday = addDays(today, -1);
  for (const [id, date] of Object.entries(posted)) if (date < yesterday) delete posted[id];
  return posted;
}

async function catchUp(
  habits: Habit[], open: Map<string, SessionSlot>, shown: Set<string>, posted: Record<string, string>, today: string,
) {
  const yesterday = addDays(today, -1);
  for (const [key, slot] of open) {
    if (slot.date < yesterday || (slot.status !== 'today' && slot.status !== 'overdue')) continue;
    const habit = habits.find((h) => key.startsWith(`${h.id}|`));
    if (!habit) continue;
    const phase: Phase = slot.status === 'overdue' ? 'overdue' : 'due';
    const id = notificationId(habit.id, slot.key, phase);
    // Its own notification is showing or was posted already: leave it.
    if (shown.has(id) || posted[id]) continue;
    await showNow(planned(habit, slot, phase, phaseMoment(slot, phase)));
    posted[id] = slot.date;
  }
  // Ones showing now count as posted too, so swiping them away sticks.
  for (const id of shown) posted[id] ??= id.split('|')[2] ?? today;
}

/** expo-notifications only: when the Overdue notification shows, take down the Due one. */
export function replaceDueWith(n: Notifications.Notification) {
  const d = habitData(n.request);
  if (d?.phase !== 'overdue') return;
  Notifications.dismissNotificationAsync(notificationId(d.habitId, d.slotKey, 'due')).catch(() => {});
}

export { useNative as habitNotificationsNative };
