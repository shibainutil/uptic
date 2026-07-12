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
import type { CleaningTask, CleaningLogEntry } from '../types/cleaning';

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

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function useCleaningTasks(userId: string | null | undefined) {
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(userCol(userId, 'cleaningTasks'), (snap) => {
      setTasks(snap.docs.map((d) => d.data() as CleaningTask));
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const add = useCallback(async (data: Omit<CleaningTask, 'id' | 'createdAt'>): Promise<string> => {
    const id = uid();
    const docData = { ...data, id, createdAt: new Date().toISOString() };
    await setDoc(userDoc(userId!, 'cleaningTasks', id), stripUndefined(docData));
    return id;
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<CleaningTask>) => {
    await updateDoc(userDoc(userId!, 'cleaningTasks', id), stripUndefined(data as Record<string, unknown>));
  }, [userId]);

  // Deleting a task cascades to its logged entries (and any not-yet-migrated
  // legacy session docs for it, just in case the migration hasn't run yet).
  const remove = useCallback(async (id: string) => {
    const [entrySnap, legacySnap] = await Promise.all([
      getDocs(query(userCol(userId!, 'cleaningLogEntries'), where('taskId', '==', id))),
      getDocs(query(userCol(userId!, 'cleaningSessions'), where('taskId', '==', id))),
    ]);
    const batch = writeBatch(db);
    entrySnap.docs.forEach((d) => batch.delete(d.ref));
    legacySnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(userDoc(userId!, 'cleaningTasks', id));
    await batch.commit();
  }, [userId]);

  return { tasks, loaded, add, update, remove };
}

// ── Log entries ───────────────────────────────────────────────────────────────
// Freeform, append-only: a session is logged whenever the user says so — on
// schedule, early, late, or multiple times a day — not by consuming a
// pre-generated pending slot. Entries are fully editable and deletable.

export function useCleaningLogEntries(userId: string | null | undefined) {
  const [entries, setEntries] = useState<CleaningLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setEntries([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(userCol(userId, 'cleaningLogEntries'), (snap) => {
      setEntries(snap.docs.map((d) => d.data() as CleaningLogEntry));
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const add = useCallback(async (data: Omit<CleaningLogEntry, 'id' | 'createdAt'>): Promise<string> => {
    const id = uid();
    const docData = { ...data, id, createdAt: new Date().toISOString() };
    await setDoc(userDoc(userId!, 'cleaningLogEntries', id), stripUndefined(docData));
    return id;
  }, [userId]);

  // Logs `count` entries at once (e.g. catching up on several sessions in one sitting),
  // all timestamped now.
  const addMany = useCallback(async (taskId: string, variant: 'normal' | 'deep' | undefined, count: number) => {
    if (count <= 0) return;
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    for (let i = 0; i < count; i++) {
      const id = uid();
      batch.set(userDoc(userId!, 'cleaningLogEntries', id), stripUndefined({
        id, taskId, variant, loggedAt: now, createdAt: now,
      }));
    }
    await batch.commit();
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<CleaningLogEntry>) => {
    await updateDoc(userDoc(userId!, 'cleaningLogEntries', id), stripUndefined(data as Record<string, unknown>));
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(userDoc(userId!, 'cleaningLogEntries', id));
  }, [userId]);

  return { entries, loaded, add, addMany, update, remove };
}

// ── One-time migration ───────────────────────────────────────────────────────
// The old `cleaningSessions` collection (pending/completed/failed slots) was
// replaced by the freeform `cleaningLogEntries` log. Anything already marked
// completed there represents a real logged session and gets carried over;
// everything else (pending/failed placeholders) is no longer meaningful and is
// dropped. Runs once per mount — once the old collection is empty there's
// nothing left to migrate, so it's naturally idempotent.
export function useMigrateLegacyCleaningSessions(userId: string | null | undefined) {
  const ran = useRef(false);

  useEffect(() => {
    if (!userId || ran.current) return;
    ran.current = true;

    (async () => {
      const snap = await getDocs(userCol(userId, 'cleaningSessions'));
      if (snap.empty) return;

      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        const s = d.data() as {
          id: string; taskId: string; variant?: 'normal' | 'deep'; status: string;
          dueDate: string; completedAt?: string; createdAt: string; notes?: string;
        };
        if (s.status === 'completed') {
          const loggedAt = s.completedAt ?? `${s.dueDate}T00:00:00.000Z`;
          batch.set(userDoc(userId, 'cleaningLogEntries', s.id), stripUndefined({
            id: s.id, taskId: s.taskId, variant: s.variant, loggedAt, notes: s.notes, createdAt: s.createdAt,
          }));
        }
        batch.delete(d.ref);
      });
      await batch.commit();
    })().catch(() => { ran.current = false; /* retry on next mount */ });
  }, [userId]);
}
