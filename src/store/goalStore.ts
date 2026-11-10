import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteField,
  writeBatch,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useState, useCallback } from 'react';
import { db } from '../firebase';
import type { Goal, GoalInput } from '../types/goals';

const GOALS_COL = 'goals';
const HABITS_COL = 'cleaningTasks'; // see habitStore: legacy collection name

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function goalDoc(userId: string, id: string) {
  return doc(db, 'users', userId, GOALS_COL, id);
}

function stripUndefined(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/** Like stripUndefined, but turns undefined into deleteField() so clearing an optional field sticks. */
function toUpdate(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === undefined ? deleteField() : v]));
}

export function useGoals(userId: string | null | undefined) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setGoals([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(collection(db, 'users', userId, GOALS_COL), (snap) => {
      const list = snap.docs.map((d) => d.data() as Goal);
      list.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
      setGoals(list);
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const nextOrder = useCallback((pillarId: string) => {
    const siblings = goals.filter((g) => g.pillarId === pillarId);
    return siblings.length ? Math.max(...siblings.map((g) => g.order)) + 1 : 0;
  }, [goals]);

  const add = useCallback(async (data: GoalInput): Promise<string> => {
    const id = uid();
    const docData: Goal = { ...data, id, order: nextOrder(data.pillarId), createdAt: new Date().toISOString() };
    await setDoc(goalDoc(userId!, id), stripUndefined(docData));
    return id;
  }, [userId, nextOrder]);

  /** Pass a field as undefined to clear it. Moving to another pillar appends it there. */
  const update = useCallback(async (id: string, data: Partial<GoalInput>) => {
    const current = goals.find((g) => g.id === id);
    const patch: Partial<Goal> = { ...data };
    if (current && data.pillarId && data.pillarId !== current.pillarId) patch.order = nextOrder(data.pillarId);
    await updateDoc(goalDoc(userId!, id), toUpdate(patch));
  }, [userId, goals, nextOrder]);

  /** Persists a new order within one pillar: `ids` are that pillar's goal ids in their new order. */
  const reorder = useCallback(async (ids: string[]) => {
    const batch = writeBatch(db);
    ids.forEach((id, i) => {
      const g = goals.find((x) => x.id === id);
      if (g && g.order !== i) batch.update(goalDoc(userId!, id), { order: i });
    });
    await batch.commit();
  }, [userId, goals]);

  // Linked habits are unlinked (not deleted) so their logs survive.
  // TODO(projects): block or cascade once projects link to goals.
  const remove = useCallback(async (id: string) => {
    const linked = await getDocs(query(collection(db, 'users', userId!, HABITS_COL), where('goalId', '==', id)));
    const batch = writeBatch(db);
    linked.docs.forEach((d) => batch.update(d.ref, { goalId: deleteField() }));
    batch.delete(goalDoc(userId!, id));
    await batch.commit();
  }, [userId]);

  return { goals, loaded, add, update, reorder, remove };
}
