import { collection, doc, onSnapshot, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../firebase';

/** One drink. `date` is the local day (YYYY-MM-DD), `at` the ISO time it was logged. */
export interface WaterLog {
  id: string;
  date: string;
  ml: number;
  at: string;
}

export const WATER_GOAL_ML = 2500;

export function localDate(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Water logged on or after `fromDate` (YYYY-MM-DD), newest first. */
export function useWaterLogs(userId: string | null | undefined, fromDate: string) {
  const [logs, setLogs] = useState<WaterLog[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLogs([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const q = query(collection(db, 'users', userId, 'waterLogs'), where('date', '>=', fromDate));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => d.data() as WaterLog);
      list.sort((a, b) => b.at.localeCompare(a.at));
      setLogs(list);
      setLoaded(true);
    });
  }, [userId, fromDate]);

  const add = useCallback(async (ml: number, at: Date = new Date()) => {
    const id = `${at.getTime()}`;
    const log: WaterLog = { id, date: localDate(at), ml, at: at.toISOString() };
    await setDoc(doc(db, 'users', userId!, 'waterLogs', id), log);
    return log;
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'users', userId!, 'waterLogs', id));
  }, [userId]);

  return { logs, loaded, add, remove };
}

export const DEFAULT_WATER_AMOUNTS = [150, 250, 330, 500];

/**
 * The quick-add amounts (ml), saved per user at users/{uid}/settings/waterAmounts so
 * they're the same on every device. Starts with the defaults until changed.
 */
export function useWaterAmounts(userId: string | null | undefined) {
  const [amounts, setAmounts] = useState<number[]>(DEFAULT_WATER_AMOUNTS);

  useEffect(() => {
    if (!userId) {
      setAmounts(DEFAULT_WATER_AMOUNTS);
      return;
    }
    return onSnapshot(doc(db, 'users', userId, 'settings', 'waterAmounts'), (snap) => {
      const list = snap.exists() ? (snap.data().amounts as number[] | undefined) : undefined;
      setAmounts(Array.isArray(list) ? list : DEFAULT_WATER_AMOUNTS);
    });
  }, [userId]);

  const save = useCallback(async (next: number[]) => {
    const clean = [...new Set(next.filter((n) => Number.isFinite(n) && n > 0).map(Math.round))].sort((a, b) => a - b);
    setAmounts(clean);
    await setDoc(doc(db, 'users', userId!, 'settings', 'waterAmounts'), { amounts: clean });
  }, [userId]);

  /** Adds an amount to the list (no-op if it's already there). */
  const addAmount = useCallback((ml: number) => (amounts.includes(ml) ? Promise.resolve() : save([...amounts, ml])), [amounts, save]);
  const removeAmount = useCallback((ml: number) => save(amounts.filter((a) => a !== ml)), [amounts, save]);

  return { amounts, addAmount, removeAmount };
}
