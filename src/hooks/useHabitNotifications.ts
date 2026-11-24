import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useHabits, useHabitLogEntries } from '../store/habitStore';
import { sessionSlots } from '../lib/habitSchedule';
import { todayISO } from '../lib/schedule';
import { habitSlotActions } from '../lib/habitSlotActions';
import {
  ACTION_DONE, ACTION_SKIP, habitData, habitNotificationsNative, notificationsSupported, parseHabitData,
  rearmHabitNotifications, replaceDueWith, setupHabitNotifications, syncHabitNotifications,
  type HabitNotificationData,
} from '../lib/habitNotifications';
import { onAlarmAction, takeAlarmActions } from '../lib/habitAlarms';
import { useNow } from './useNow';

// expo-notifications shows habit notifications only off Android; there, while the app is
// open, the Overdue one takes down the Due one.
if (notificationsSupported && !habitNotificationsNative) {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      replaceDueWith(n);
      return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
    },
  });
}

/** A notification tap or button press, from either scheduler. */
interface HabitAction { kind: 'open' | 'done' | 'skip'; data: HabitNotificationData }

/**
 * Keeps habit session notifications scheduled for the signed-in user and carries out
 * their Skip / Done buttons. Mounted once, at the app root.
 */
export function useHabitNotifications(userId: string | null | undefined) {
  const router = useRouter();
  const { habits, loaded: habitsLoaded, setSkipped, setPauses } = useHabits(userId);
  const { entries, loaded: entriesLoaded, add, update, remove } = useHabitLogEntries(userId);
  const loaded = !!userId && habitsLoaded && entriesLoaded;
  const now = useNow();
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);
  const queue = useRef<HabitAction[]>([]);
  const seen = useRef(new Set<string>());
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    if (!userId || !notificationsSupported) return;
    setupHabitNotifications().then(setReady);
  }, [userId]);

  // Coming back to the app: re-check right away instead of waiting for the next minute.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { rearmHabitNotifications(); setActive((n) => n + 1); } });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!ready || !loaded) return;
    syncHabitNotifications(habits, entries, todayISO(), new Date())
      .catch((e) => console.warn('Habit notifications sync failed', e));
  }, [ready, loaded, habits, entries, now, active]);

  const enqueue = (a: HabitAction, key: string) => {
    if (seen.current.has(key)) return;
    seen.current.add(key);
    queue.current.push(a);
    setQueued((n) => n + 1);
  };

  // Android: Skip / Done from Uptic's own scheduler, including presses made while the app
  // was closed. (A tap opens the habit through its deep link, so it needs nothing here.)
  useEffect(() => {
    if (!habitNotificationsNative) return;
    const take = (a: { id: string; action: string; data: string; at: number }) => {
      let data: HabitNotificationData | undefined;
      try { data = parseHabitData(JSON.parse(a.data)); } catch { data = undefined; }
      if (data && (a.action === 'done' || a.action === 'skip')) enqueue({ kind: a.action, data }, `${a.id}|${a.action}|${a.at}`);
    };
    takeAlarmActions().forEach(take);
    const off = onAlarmAction(take);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') takeAlarmActions().forEach(take); });
    return () => { off(); sub.remove(); };
  }, []);

  // Elsewhere: taps and button presses from expo-notifications, including the launching one.
  useEffect(() => {
    if (!notificationsSupported || habitNotificationsNative) return;
    const push = (r: Notifications.NotificationResponse | null) => {
      const data = r && habitData(r.notification.request);
      if (!r || !data) return;
      Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => {});
      const kind = r.actionIdentifier === ACTION_DONE ? 'done' : r.actionIdentifier === ACTION_SKIP ? 'skip'
        : r.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ? 'open' : null;
      if (kind) enqueue({ kind, data }, `${r.notification.request.identifier}|${r.actionIdentifier}|${r.notification.date}`);
    };
    Notifications.getLastNotificationResponseAsync().then(push).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(push);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!loaded || queue.current.length === 0) return;
    const actions = habitSlotActions({
      today: todayISO(), habits, entries, setPauses, add, update, remove, setSkipped,
      onError: (e) => console.warn('Habit notification action failed', e),
    });
    for (const { kind, data: d } of queue.current.splice(0)) {
      if (kind === 'open') {
        router.push(`/habits/entries/${d.habitId}`);
        continue;
      }
      const habit = habits.find((h) => h.id === d.habitId);
      if (!habit) continue;
      // Already handled (pressed twice, or done in the app meanwhile): leave it.
      const slot = sessionSlots(habit, entries, todayISO()).find((s) => s.key === d.slotKey);
      if (slot && (slot.status === 'done' || slot.status === 'skipped')) continue;
      const target = slot ?? { key: d.slotKey, date: d.date, time: d.time, status: 'overdue' as const };
      if (kind === 'done') actions.markDone(habit.id, target);
      else actions.skip(habit.id, target, true);
    }
    if (!habitNotificationsNative) Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [loaded, queued, habits, entries]);
}
