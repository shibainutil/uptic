import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useState, useCallback, useRef } from 'react';
import { db } from '../firebase';
import type { Habit, HabitLogEntry } from '../types/habits';

// Firestore collection names predate the Cleaning -> Habits rename and were kept
// as-is to avoid a risky data migration; they're an internal implementation
// detail invisible to the user.
const HABITS_COL = 'cleaningTasks';
const ENTRIES_COL = 'cleaningLogEntries';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function userCol(uid: string, col: string) {
  return collection(db, 'users', uid, col);
}

function userDoc(uid: string, col: string, id: string) {
  return doc(db, 'users', uid, col, id);
}

function stripUndefined(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// ── Habits ────────────────────────────────────────────────────────────────────

export function useHabits(userId: string | null | undefined) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setHabits([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(userCol(userId, HABITS_COL), (snap) => {
      setHabits(snap.docs.map((d) => d.data() as Habit));
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const add = useCallback(async (data: Omit<Habit, 'id' | 'createdAt'>): Promise<string> => {
    const id = uid();
    const docData = { ...data, id, createdAt: new Date().toISOString() };
    await setDoc(userDoc(userId!, HABITS_COL, id), stripUndefined(docData));
    return id;
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<Habit>) => {
    await updateDoc(userDoc(userId!, HABITS_COL, id), stripUndefined(data as Record<string, unknown>));
  }, [userId]);

  // Deleting a habit cascades to its logged entries.
  const remove = useCallback(async (id: string) => {
    const entrySnap = await getDocs(
      query(userCol(userId!, ENTRIES_COL), where('habitId', '==', id)),
    );
    const batch = writeBatch(db);
    entrySnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(userDoc(userId!, HABITS_COL, id));
    await batch.commit();
  }, [userId]);

  return { habits, loaded, add, update, remove };
}

// ── Log entries ───────────────────────────────────────────────────────────────
// Freeform, append-only: a session is logged whenever the user says so — on
// schedule, early, late, or multiple times a day — not by consuming a
// pre-generated pending slot. Entries are fully editable and deletable.

export function useHabitLogEntries(userId: string | null | undefined) {
  const [entries, setEntries] = useState<HabitLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setEntries([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(userCol(userId, ENTRIES_COL), (snap) => {
      setEntries(snap.docs.map((d) => d.data() as HabitLogEntry));
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const add = useCallback(async (data: Omit<HabitLogEntry, 'id' | 'createdAt'>): Promise<string> => {
    const id = uid();
    const docData = { ...data, id, createdAt: new Date().toISOString() };
    await setDoc(userDoc(userId!, ENTRIES_COL, id), stripUndefined(docData));
    return id;
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<HabitLogEntry>) => {
    await updateDoc(userDoc(userId!, ENTRIES_COL, id), stripUndefined(data as Record<string, unknown>));
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(userDoc(userId!, ENTRIES_COL, id));
  }, [userId]);

  return { entries, loaded, add, update, remove };
}

// ── One-time migration ───────────────────────────────────────────────────────
// Older habit docs (from the Cleaning-module days) used normalSchedule/deepSchedule
// per-variant fields and had no `schedule`/unified kind. Give any doc missing
// `schedule` a best-effort single schedule (the old normal schedule, or a plain
// daily default for goal-based habits that never had one) and normalize `kind`.
// Older log entry docs used `taskId` instead of `habitId` — copy it over so
// existing logged sessions don't silently disappear. Runs once per mount;
// idempotent once every doc has the new field(s).
export function useMigrateLegacyHabitSchema(userId: string | null | undefined) {
  const ran = useRef(false);

  useEffect(() => {
    if (!userId || ran.current) return;
    ran.current = true;

    (async () => {
      const [habitsSnap, entriesSnap] = await Promise.all([
        getDocs(userCol(userId, HABITS_COL)),
        getDocs(userCol(userId, ENTRIES_COL)),
      ]);
      const legacyHabits = habitsSnap.docs.filter((d) => !('schedule' in d.data()));
      const legacyEntries = entriesSnap.docs.filter((d) => {
        const raw = d.data() as Record<string, unknown>;
        return !raw.habitId && Boolean(raw.taskId);
      });
      if (legacyHabits.length === 0 && legacyEntries.length === 0) return;

      const batch = writeBatch(db);
      legacyHabits.forEach((d) => {
        const raw = d.data() as Record<string, unknown>;
        const oldKind = raw.kind as string | undefined;
        const kind = oldKind === 'finite' ? 'limited' : 'continuous';
        const schedule = raw.normalSchedule ?? { unit: 'day', interval: 1, timesOfDay: ['08:00'] };
        batch.update(d.ref, stripUndefined({ kind, schedule }));
      });
      legacyEntries.forEach((d) => {
        const raw = d.data() as Record<string, unknown>;
        batch.update(d.ref, { habitId: raw.taskId });
      });
      await batch.commit();
    })().catch(() => { ran.current = false; /* retry on next mount */ });
  }, [userId]);
}
