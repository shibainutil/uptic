import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { addDays, fromISO } from './schedule';
import { DUE_WINDOW_MIN, sessionSlots, type SessionSlot } from './habitSchedule';
import { isHabitComplete, totalSessions, type Habit, type HabitLogEntry } from '../types/habits';

// One notification per session: "Due" fires DUE_WINDOW_MIN before the session, "Overdue"
// DUE_WINDOW_MIN after it. They are scheduled ahead so they arrive with the app closed.
// Both share a session id, and whenever the app is running the Due one is dismissed as
// soon as the Overdue one shows (or the session is handled), so only one stays visible.

export const HABIT_CATEGORY = 'habit-session';
export const ACTION_DONE = 'habit-done';
export const ACTION_SKIP = 'habit-skip';
const CHANNEL = 'habits';
const KIND = 'habit-session';
const DAYS_AHEAD = 2;   // today plus the next two days
const MAX_SCHEDULED = 60; // iOS keeps at most 64 pending local notifications

export const notificationsSupported = Platform.OS !== 'web';

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

export function habitData(n: Notifications.NotificationRequest | undefined): HabitNotificationData | undefined {
  const d = n?.content.data as Partial<HabitNotificationData> | undefined;
  return d?.kind === KIND && d.habitId && d.slotKey ? (d as HabitNotificationData) : undefined;
}

function content(habit: Habit, slot: Pick<SessionSlot, 'key' | 'date' | 'time'>, phase: Phase, at: number): Notifications.NotificationContentInput {
  const data: HabitNotificationData = {
    kind: KIND, habitId: habit.id, slotKey: slot.key, date: slot.date, time: slot.time, phase, at,
  };
  // Android can't colour notification text, so the status carries a coloured circle:
  // blue for Due, orange for Overdue, like the Habits screen.
  const status = phase === 'due' ? '🔵 Due' : '🟠 Overdue';
  const date = fromISO(slot.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    title: `${habit.name} · ${status}`,
    body: `${date} · ${slot.time}`,
    data, categoryIdentifier: HABIT_CATEGORY, sound: 'default',
  };
}

function slotMoment(slot: Pick<SessionSlot, 'date' | 'time'>): number {
  const [h, m] = slot.time.split(':').map(Number);
  const d = fromISO(slot.date);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

interface Planned { id: string; at: number; content: Notifications.NotificationContentInput }

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
      const at = slotMoment(slot);
      const phases: [Phase, number][] = [
        ['due', at - DUE_WINDOW_MIN * 60_000],
        ['overdue', at + DUE_WINDOW_MIN * 60_000],
      ];
      for (const [phase, when] of phases) {
        if (when <= nowMs) continue;
        out.push({ id: notificationId(habit.id, slot.key, phase), at: when, content: content(habit, slot, phase, when) });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_SCHEDULED);
}

let setupDone: Promise<boolean> | undefined;

/** Permission, Android channel, and the Skip / Done buttons. Runs once. */
export function setupHabitNotifications(): Promise<boolean> {
  if (!notificationsSupported) return Promise.resolve(false);
  setupDone ??= (async () => {
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
  const wanted = new Map(plan.map((p) => [p.id, p]));

  const open = openSessions(habits, entries, today, now);

  const presented = await Notifications.getPresentedNotificationsAsync();
  const shown = new Set<string>();
  for (const n of presented) {
    const d = habitData(n.request);
    if (!d) continue;
    const slot = open.get(`${d.habitId}|${d.slotKey}`);
    if (!slot || (d.phase === 'due' && slot.status === 'overdue')) {
      await Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
    } else {
      shown.add(n.request.identifier);
    }
  }

  try {
    let scheduled = await Notifications.getAllScheduledNotificationsAsync();
    // Alarms scheduled by an older native build (e.g. before exact alarms were allowed) are
    // kept as they are by the matching below, so re-create all of them once per build.
    const version = `${Application.nativeApplicationVersion}|${Application.nativeBuildVersion}|exact1`;
    const rescheduleAll = (await AsyncStorage.getItem(SCHEDULE_VERSION_KEY)) !== version;
    if (rescheduleAll) {
      for (const req of scheduled) {
        if (habitData(req)) await Notifications.cancelScheduledNotificationAsync(req.identifier);
      }
      scheduled = [];
    }
    // On Android a force-stop (swiping the app away on Xiaomi/HyperOS, battery cleanup)
    // wipes the OS alarms but not expo's list of scheduled requests, so "already scheduled"
    // can't be trusted: re-arm everything whenever the app starts or comes back.
    const rearm = rearmNext || rescheduleAll;
    rearmNext = false;
    const posted = await loadPosted(today);
    const have = new Map<string, number>();
    for (const req of scheduled) {
      const d = habitData(req);
      if (!d) continue;
      // Still listed well after its moment: its alarm never fired (it was wiped). Drop it
      // and let catch-up post the session's notification now.
      if (d.at < now.getTime() - MISSED_AFTER_MS) {
        delete posted[req.identifier];
        await Notifications.cancelScheduledNotificationAsync(req.identifier).catch(() => {});
        continue;
      }
      const want = wanted.get(req.identifier);
      const same = want && want.at === d.at && want.content.title === req.content.title && want.content.body === req.content.body;
      if (same && !rearm) { have.set(req.identifier, d.at); continue; }
      if (same) continue; // re-armed below under the same id
      // One that is about to fire for a still-open session drops out of the plan only
      // because its moment is here; let it fire.
      const firing = d.at <= now.getTime() + 10_000 && open.has(`${d.habitId}|${d.slotKey}`);
      if (!firing) await Notifications.cancelScheduledNotificationAsync(req.identifier);
    }
    for (const p of plan) {
      // Scheduled with the OS: it fires on its own, so catch-up must never post it again.
      posted[p.id] = (p.content.data as HabitNotificationData).date;
      if (have.has(p.id)) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: p.id,
        content: p.content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL },
      });
    }

    await catchUp(habits, open, shown, posted, today);
    await AsyncStorage.setItem(POSTED_KEY, JSON.stringify(posted));
    if (rescheduleAll) await AsyncStorage.setItem(SCHEDULE_VERSION_KEY, version);
  } catch (e) {
    console.warn('Habit notifications scheduling failed', e);
  }
}

const MISSED_AFTER_MS = 2 * 60_000;
let rearmNext = true; // first sync of every app process

/** Re-create every OS alarm on the next sync (call when the app comes to the foreground). */
export function rearmHabitNotifications() {
  rearmNext = true;
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
    out.push({ habit, slot, phase, at: slotMoment(slot) + (phase === 'due' ? -1 : 1) * DUE_WINDOW_MIN * 60_000 });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Every notification still scheduled with the OS, earliest first. */
export function upcomingHabitNotifications(habits: Habit[], entries: HabitLogEntry[], today: string, now: Date): SessionNotification[] {
  const open = openSessions(habits, entries, today, now);
  return planHabitNotifications(habits, entries, today, now).flatMap((p) => {
    const d = p.content.data as HabitNotificationData;
    const habit = habits.find((h) => h.id === d.habitId);
    const slot = open.get(`${d.habitId}|${d.slotKey}`);
    return habit && slot ? [{ habit, slot, phase: d.phase, at: p.at }] : [];
  });
}

/** Show a session's notification on the phone now (replacing its earlier one, if any). */
export async function showHabitNotification(n: SessionNotification) {
  await setupHabitNotifications();
  if (n.phase === 'overdue') await Notifications.dismissNotificationAsync(notificationId(n.habit.id, n.slot.key, 'due')).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: notificationId(n.habit.id, n.slot.key, n.phase),
    content: content(n.habit, n.slot, n.phase, n.at),
    trigger: { channelId: CHANNEL },
  });
}

const POSTED_KEY = 'habitNotifications.posted';
const SCHEDULE_VERSION_KEY = 'habitNotifications.scheduleVersion';

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
    const at = slotMoment(slot) + (phase === 'due' ? -1 : 1) * DUE_WINDOW_MIN * 60_000;
    if (phase === 'overdue') await Notifications.dismissNotificationAsync(notificationId(habit.id, slot.key, 'due')).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: id, content: content(habit, slot, phase, at), trigger: { channelId: CHANNEL },
    });
    posted[id] = slot.date;
  }
  // Ones showing now count as posted too, so swiping them away sticks.
  for (const id of shown) posted[id] ??= id.split('|')[2] ?? today;
}

/** When the Overdue notification shows, take down that session's Due one. */
export function replaceDueWith(n: Notifications.Notification) {
  const d = habitData(n.request);
  if (d?.phase !== 'overdue') return;
  Notifications.dismissNotificationAsync(notificationId(d.habitId, d.slotKey, 'due')).catch(() => {});
}
