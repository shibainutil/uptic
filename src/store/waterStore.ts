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
