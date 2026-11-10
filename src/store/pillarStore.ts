import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useState, useCallback } from 'react';
import { db } from '../firebase';
import type { Pillar } from '../types/pillars';

const PILLARS_COL = 'pillars';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function pillarDoc(userId: string, id: string) {
  return doc(db, 'users', userId, PILLARS_COL, id);
}

function stripUndefined(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export function usePillars(userId: string | null | undefined) {
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setPillars([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(collection(db, 'users', userId, PILLARS_COL), (snap) => {
      const list = snap.docs.map((d) => d.data() as Pillar);
      list.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
      setPillars(list);
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const nextOrder = useCallback(
    () => (pillars.length ? Math.max(...pillars.map((p) => p.order)) + 1 : 0),
    [pillars],
  );

  const add = useCallback(async (data: Omit<Pillar, 'id' | 'createdAt' | 'order'>): Promise<string> => {
    const id = uid();
    const docData: Pillar = { ...data, id, order: nextOrder(), createdAt: new Date().toISOString() };
    await setDoc(pillarDoc(userId!, id), stripUndefined(docData));
    return id;
  }, [userId, nextOrder]);

  /** Adds several pillars in one write, appended in the given order. */
  const addMany = useCallback(async (items: Omit<Pillar, 'id' | 'createdAt' | 'order'>[]) => {
    const batch = writeBatch(db);
    const start = nextOrder();
    const now = new Date().toISOString();
    items.forEach((item, i) => {
      const id = uid();
      batch.set(pillarDoc(userId!, id), stripUndefined({ ...item, id, order: start + i, createdAt: now }));
    });
    await batch.commit();
  }, [userId, nextOrder]);

  const update = useCallback(async (id: string, data: Partial<Pillar>) => {
    await updateDoc(pillarDoc(userId!, id), stripUndefined(data));
  }, [userId]);

  /** Persists a new display order: `ids` is the full list of pillar ids in their new order. */
  const reorder = useCallback(async (ids: string[]) => {
    const batch = writeBatch(db);
    ids.forEach((id, i) => {
      const p = pillars.find((x) => x.id === id);
      if (p && p.order !== i) batch.update(pillarDoc(userId!, id), { order: i });
    });
    await batch.commit();
  }, [userId, pillars]);

  /** Callers must check first: a pillar may only be archived once all its goals are achieved. */
  const setArchived = useCallback(async (id: string, archived: boolean) => {
    await updateDoc(pillarDoc(userId!, id), { archivedAt: archived ? new Date().toISOString() : deleteField() });
  }, [userId]);

  // Callers must check for goals first: app/(tabs)/pillars.tsx blocks deleting a pillar that still has goals.
  const remove = useCallback(async (id: string) => {
    await deleteDoc(pillarDoc(userId!, id));
  }, [userId]);

  return { pillars, loaded, add, addMany, update, reorder, setArchived, remove };
}
