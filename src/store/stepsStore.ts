import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import type { WatchDay } from '../lib/garminSteps';

/** One day's totals from the Garmin watch, at users/{uid}/stepDays/{date}. */
export interface StepDay extends WatchDay {
  updatedAt: string;
}

export function saveStepDay(uid: string, day: WatchDay) {
  const data: StepDay = { ...day, updatedAt: new Date().toISOString() };
  return setDoc(doc(db, 'users', uid, 'stepDays', day.date), data);
}

/** Watch step days on or after `fromDate` (YYYY-MM-DD), newest first. */
export function useStepDays(userId: string | null | undefined, fromDate: string) {
  const [days, setDays] = useState<StepDay[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setDays([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const q = query(collection(db, 'users', userId, 'stepDays'), where('date', '>=', fromDate));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => d.data() as StepDay);
      list.sort((a, b) => b.date.localeCompare(a.date));
      setDays(list);
      setLoaded(true);
    });
  }, [userId, fromDate]);

  return { days, loaded };
}
