import { useEffect, useRef } from 'react';
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { HABITS_COL, ENTRIES_COL } from '../store/habitStore';
import { WEIGHT_HABIT_ID, WEIGHT_METRIC_ID, newWeightHabit, weightEntryId, weighInLoggedAt } from '../lib/weightHabit';
import { toKg, type WeightEntry, type WeightTarget } from '../types/weight';

const BATCH_SIZE = 400; // Firestore allows 500 writes per batch

/**
 * Weight used to live in its own collections (weightEntries + settings/weightTarget). It is
 * now a habit (id "weight") with one metric, each weigh-in a log entry. This creates that
 * habit for every user and, once, copies the old entries and target into it. The old
 * documents are left untouched. A flag document makes the copy one-time, so later edits to
 * the habit's entries are never overwritten. If the habit was deleted, the next launch
 * recreates it (empty). Idempotent; runs once per mount.
 */
export function useMigrateWeightToHabit(userId: string | null | undefined) {
  const ran = useRef(false);

  useEffect(() => {
    if (!userId || ran.current) return;
    ran.current = true;

    (async () => {
      const habitRef = doc(db, 'users', userId, HABITS_COL, WEIGHT_HABIT_ID);
      const flagRef = doc(db, 'users', userId, 'settings', 'weightHabitMigration');
      const [habitSnap, flagSnap] = await Promise.all([getDoc(habitRef), getDoc(flagRef)]);
      if (habitSnap.exists() && flagSnap.exists()) return;

      let legacy: WeightEntry[] = [];
      let target: WeightTarget | undefined;
      if (!flagSnap.exists()) {
        const [entriesSnap, targetSnap] = await Promise.all([
          getDocs(collection(db, 'users', userId, 'weightEntries')),
          getDoc(doc(db, 'users', userId, 'settings', 'weightTarget')),
        ]);
        legacy = entriesSnap.docs.map((d) => d.data() as WeightEntry).sort((a, b) => a.date.localeCompare(b.date));
        if (targetSnap.exists()) target = targetSnap.data() as WeightTarget;
      }

      if (!habitSnap.exists()) {
        const unit = legacy[legacy.length - 1]?.unit ?? 'kg';
        const kgTarget = target
          ? { value: toKg(target.value, target.unit), ...(target.byDate ? { byDate: target.byDate } : {}) }
          : undefined;
        await setDoc(habitRef, { ...newWeightHabit(unit, kgTarget), createdAt: new Date().toISOString() });
      }

      if (!flagSnap.exists()) {
        for (let i = 0; i < legacy.length; i += BATCH_SIZE) {
          const batch = writeBatch(db);
          for (const e of legacy.slice(i, i + BATCH_SIZE)) {
            const entry: Record<string, unknown> = {
              id: weightEntryId(e.date),
              habitId: WEIGHT_HABIT_ID,
              // Keep the real weigh-in time (createdAt) when it was that day: Health Connect uses it.
              loggedAt: weighInLoggedAt(e.date, new Date(e.createdAt)),
              count: 1,
              values: { [WEIGHT_METRIC_ID]: toKg(e.value, e.unit) },
              createdAt: e.createdAt,
            };
            if (e.note) entry.notes = e.note;
            batch.set(doc(db, 'users', userId, ENTRIES_COL, weightEntryId(e.date)), entry);
          }
          await batch.commit();
        }
        await setDoc(flagRef, { migratedAt: new Date().toISOString(), entries: legacy.length });
      }
    })().catch((e) => { ran.current = false; console.warn('Weight habit migration failed', e); });
  }, [userId]);
}
