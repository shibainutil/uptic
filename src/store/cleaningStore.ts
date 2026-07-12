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
import type { CleaningTask, CleaningSession, CleaningSessionStatus } from '../types/cleaning';
import { reconcileCleaningSessions } from '../lib/cleaningSchedule';
import { todayISO } from '../lib/schedule';

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

  // Deleting a task cascades to its cleaning sessions.
  const remove = useCallback(async (id: string) => {
    const sessionSnap = await getDocs(
      query(userCol(userId!, 'cleaningSessions'), where('taskId', '==', id)),
    );
    const batch = writeBatch(db);
    sessionSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(userDoc(userId!, 'cleaningTasks', id));
    await batch.commit();
  }, [userId]);

  return { tasks, loaded, add, update, remove };
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export function useCleaningSessions(userId: string | null | undefined) {
  const [sessions, setSessions] = useState<CleaningSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setSessions([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(userCol(userId, 'cleaningSessions'), (snap) => {
      setSessions(snap.docs.map((d) => d.data() as CleaningSession));
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const setStatus = useCallback(async (id: string, status: CleaningSessionStatus) => {
    await updateDoc(userDoc(userId!, 'cleaningSessions', id), {
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : null,
    });
  }, [userId]);

  // Tombstone instead of delete — deleting outright would free up the id and the
  // reconciler would immediately recreate it on the next check (same reasoning as
  // routine executions).
  const remove = useCallback(async (id: string) => {
    await updateDoc(userDoc(userId!, 'cleaningSessions', id), { deleted: true });
  }, [userId]);

  // Move a session to a new due date. Old doc is tombstoned (rescheduledTo) rather
  // than deleted so the reconciler won't recreate it at the original date.
  const reschedule = useCallback(async (session: CleaningSession, newDate: string) => {
    const newId = session.variant
      ? `${session.taskId}_${session.variant}_${newDate}`
      : `${session.taskId}_${newDate}`;
    const batch = writeBatch(db);
    batch.update(userDoc(userId!, 'cleaningSessions', session.id), { rescheduledTo: newDate });
    batch.set(userDoc(userId!, 'cleaningSessions', newId), stripUndefined({
      ...session, id: newId, dueDate: newDate, status: 'pending', completedAt: null, rescheduledTo: undefined,
    }));
    await batch.commit();
  }, [userId]);

  return { sessions, loaded, setStatus, remove, reschedule };
}

/**
 * Generates pending cleaning sessions for due dates and fails overdue ones.
 * Mount once (e.g. in the cleaning screen); runs when tasks/sessions settle.
 */
export function useCleaningReconcile(
  userId: string | null | undefined,
  tasks: CleaningTask[],
  sessions: CleaningSession[],
  sessionsLoaded: boolean,
) {
  const running = useRef(false);

  useEffect(() => {
    if (!userId || tasks.length === 0 || !sessionsLoaded || running.current) return;
    const { toCreate, toFail } = reconcileCleaningSessions(tasks, sessions, todayISO());
    if (toCreate.length === 0 && toFail.length === 0) return;

    running.current = true;
    const batch = writeBatch(db);
    toCreate.forEach((session) => batch.set(userDoc(userId, 'cleaningSessions', session.id), stripUndefined(session)));
    toFail.forEach((id) => batch.update(userDoc(userId, 'cleaningSessions', id), { status: 'failed' }));
    batch
      .commit()
      .catch(() => { /* surfaced on next reconcile */ })
      .finally(() => { running.current = false; });
  }, [userId, tasks, sessions, sessionsLoaded]);
}
