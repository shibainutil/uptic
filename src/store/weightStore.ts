import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
} from 'firebase/firestore';
import { useEffect, useState, useCallback } from 'react';
import { db } from '../firebase';
import type { WeightEntry, WeightTarget, WeightUnit } from '../types/weight';

function userCol(uid: string, col: string) {
  return collection(db, 'users', uid, col);
}

function userDoc(uid: string, col: string, id: string) {
  return doc(db, 'users', uid, col, id);
}

function targetDoc(uid: string) {
  return doc(db, 'users', uid, 'settings', 'weightTarget');
}

function stripUndefined(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export function useWeightEntries(userId: string | null | undefined) {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setEntries([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(userCol(userId, 'weightEntries'), (snap) => {
      setEntries(snap.docs.map((d) => d.data() as WeightEntry));
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  // The date is the doc id, so logging again for a day that already has an
  // entry overwrites it instead of creating a duplicate.
  const upsert = useCallback(async (data: Omit<WeightEntry, 'id' | 'createdAt'>) => {
    const existing = entries.find((e) => e.date === data.date);
    const docData: WeightEntry = {
      ...data,
      id: data.date,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    await setDoc(userDoc(userId!, 'weightEntries', data.date), stripUndefined(docData));
    return data.date;
  }, [userId, entries]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(userDoc(userId!, 'weightEntries', id));
  }, [userId]);

  return { entries, loaded, upsert, remove };
}

export function useWeightTarget(userId: string | null | undefined) {
  const [target, setTarget] = useState<WeightTarget | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setTarget(null);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(targetDoc(userId), (snap) => {
      setTarget(snap.exists() ? (snap.data() as WeightTarget) : null);
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const save = useCallback(async (value: number, unit: WeightUnit) => {
    await setDoc(targetDoc(userId!), { value, unit });
  }, [userId]);

  const clear = useCallback(async () => {
    await deleteDoc(targetDoc(userId!));
  }, [userId]);

  return { target, loaded, save, clear };
}
