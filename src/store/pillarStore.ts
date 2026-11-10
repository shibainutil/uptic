import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
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

  /** Swaps a pillar with its neighbour (-1 = up, +1 = down). */
  const move = useCallback(async (id: string, direction: -1 | 1) => {
    const idx = pillars.findIndex((p) => p.id === id);
    const other = pillars[idx + direction];
    if (idx < 0 || !other) return;
    const reordered = pillars.slice();
    [reordered[idx], reordered[idx + direction]] = [other, reordered[idx]];
    // Rewrite every position so gaps or duplicate orders self-heal.
    const batch = writeBatch(db);
    reordered.forEach((p, i) => {
      if (p.order !== i) batch.update(pillarDoc(userId!, p.id), { order: i });
    });
    await batch.commit();
  }, [userId, pillars]);

  // TODO(goals): once goals exist, block or cascade deletion of pillars that still have goals.
  const remove = useCallback(async (id: string) => {
    await deleteDoc(pillarDoc(userId!, id));
  }, [userId]);

  return { pillars, loaded, add, addMany, update, move, remove };
}
