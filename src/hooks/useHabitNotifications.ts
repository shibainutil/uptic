import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useHabits, useHabitLogEntries } from '../store/habitStore';
import { sessionSlots } from '../lib/habitSchedule';
import { todayISO } from '../lib/schedule';
import { habitSlotActions } from '../lib/habitSlotActions';
import {
  ACTION_DONE, ACTION_SKIP, habitData, notificationsSupported, replaceDueWith,
  setupHabitNotifications, syncHabitNotifications,
} from '../lib/habitNotifications';
import { useNow } from './useNow';

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      replaceDueWith(n);
      return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
    },
  });
}

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
  const queue = useRef<Notifications.NotificationResponse[]>([]);
  const seen = useRef(new Set<string>());
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    if (!userId || !notificationsSupported) return;
    setupHabitNotifications().then(setReady);
  }, [userId]);

  // Coming back to the app: re-check right away instead of waiting for the next minute.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setActive((n) => n + 1); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!ready || !loaded) return;
    syncHabitNotifications(habits, entries, todayISO(), new Date())
      .catch((e) => console.warn('Habit notifications sync failed', e));
  }, [ready, loaded, habits, entries, now, active]);

  // Collect taps and button presses, including the one that launched the app.
  useEffect(() => {
    if (!notificationsSupported) return;
    const push = (r: Notifications.NotificationResponse | null) => {
      if (!r || !habitData(r.notification.request)) return;
      const key = `${r.notification.request.identifier}|${r.actionIdentifier}|${r.notification.date}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      queue.current.push(r);
      setQueued((n) => n + 1);
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
    for (const r of queue.current.splice(0)) {
      const d = habitData(r.notification.request)!;
      Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => {});
      if (r.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        router.push(`/habits/entries/${d.habitId}`);
        continue;
      }
      const habit = habits.find((h) => h.id === d.habitId);
      if (!habit) continue;
      // Already handled (pressed twice, or done in the app meanwhile): leave it.
      const slot = sessionSlots(habit, entries, todayISO()).find((s) => s.key === d.slotKey);
      if (slot && (slot.status === 'done' || slot.status === 'skipped')) continue;
      const target = slot ?? { key: d.slotKey, date: d.date, time: d.time, status: 'overdue' as const };
      if (r.actionIdentifier === ACTION_DONE) actions.markDone(habit.id, target);
      else if (r.actionIdentifier === ACTION_SKIP) actions.skip(habit.id, target, true);
    }
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [loaded, queued, habits, entries]);
}
