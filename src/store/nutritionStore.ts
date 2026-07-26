import {
  collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc,
} from 'firebase/firestore';
import { useEffect, useState, useCallback } from 'react';
import { db } from '../firebase';
import type { Ingredient, NutritionData, NutritionSettings, FastingSession } from '../types/nutrition';
import { DEFAULT_NUTRITION_SETTINGS } from '../types/nutrition';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function userCol(u: string, col: string) {
  return collection(db, 'users', u, col);
}

function userDoc(u: string, col: string, id: string) {
  return doc(db, 'users', u, col, id);
}

function settingsDoc(u: string) {
  return doc(db, 'users', u, 'settings', 'nutrition');
}

function stripUndefined(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// ── Ingredients ──────────────────────────────────────────────────────────

export function useIngredients(userId: string | null | undefined) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setIngredients([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(userCol(userId, 'ingredients'), (snap) => {
      setIngredients(snap.docs.map((d) => d.data() as Ingredient));
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const add = useCallback(async (data: Omit<Ingredient, 'id' | 'createdAt'>): Promise<string> => {
    const id = uid();
    const docData: Ingredient = { ...data, id, createdAt: new Date().toISOString() };
    await setDoc(userDoc(userId!, 'ingredients', id), stripUndefined(docData));
    return id;
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<Ingredient>) => {
    await updateDoc(userDoc(userId!, 'ingredients', id), stripUndefined({ ...data, updatedAt: new Date().toISOString() }));
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(userDoc(userId!, 'ingredients', id));
  }, [userId]);

  return { ingredients, loaded, add, update, remove };
}

// ── Nutrition entries ────────────────────────────────────────────────────

export function useNutritionEntries(userId: string | null | undefined) {
  const [entries, setEntries] = useState<NutritionData[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setEntries([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(userCol(userId, 'nutritionEntries'), (snap) => {
      setEntries(snap.docs.map((d) => d.data() as NutritionData));
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const add = useCallback(async (data: Omit<NutritionData, 'id' | 'createdAt'>): Promise<string> => {
    const id = uid();
    const docData: NutritionData = { ...data, id, createdAt: new Date().toISOString() };
    await setDoc(userDoc(userId!, 'nutritionEntries', id), stripUndefined(docData));
    return id;
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<NutritionData>) => {
    await updateDoc(userDoc(userId!, 'nutritionEntries', id), stripUndefined(data as Record<string, unknown>));
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(userDoc(userId!, 'nutritionEntries', id));
  }, [userId]);

  return { entries, loaded, add, update, remove };
}

// ── Settings ─────────────────────────────────────────────────────────────

export function useNutritionSettings(userId: string | null | undefined) {
  const [settings, setSettings] = useState<NutritionSettings>(DEFAULT_NUTRITION_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setSettings(DEFAULT_NUTRITION_SETTINGS);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(settingsDoc(userId), (snap) => {
      setSettings(snap.exists() ? { ...DEFAULT_NUTRITION_SETTINGS, ...(snap.data() as NutritionSettings) } : DEFAULT_NUTRITION_SETTINGS);
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const save = useCallback(async (data: Partial<NutritionSettings>) => {
    await setDoc(settingsDoc(userId!), stripUndefined({ ...settings, ...data }), { merge: true });
  }, [userId, settings]);

  return { settings, loaded, save };
}

// ── Fasting sessions ─────────────────────────────────────────────────────

export function useFastingSessions(userId: string | null | undefined) {
  const [sessions, setSessions] = useState<FastingSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setSessions([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(userCol(userId, 'fastingSessions'), (snap) => {
      setSessions(snap.docs.map((d) => d.data() as FastingSession));
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const activeSession = sessions.find((s) => s.isActive) ?? null;

  const startFastingAt = useCallback(async (startTime: string) => {
    if (activeSession) return activeSession;
    const id = uid();
    const session: FastingSession = { id, startTime, isActive: true };
    await setDoc(userDoc(userId!, 'fastingSessions', id), session);
    return session;
  }, [userId, activeSession]);

  const endFasting = useCallback(async () => {
    if (!activeSession) return null;
    const endTime = new Date().toISOString();
    await updateDoc(userDoc(userId!, 'fastingSessions', activeSession.id), { endTime, isActive: false });
    return { ...activeSession, endTime, isActive: false };
  }, [userId, activeSession]);

  const updateSession = useCallback(async (id: string, data: Partial<FastingSession>) => {
    await updateDoc(userDoc(userId!, 'fastingSessions', id), stripUndefined(data as Record<string, unknown>));
  }, [userId]);

  const removeSession = useCallback(async (id: string) => {
    await deleteDoc(userDoc(userId!, 'fastingSessions', id));
  }, [userId]);

  // Discards the current active cycle: deletes it and reactivates the most
  // recently ended session (if any), so the previous cycle "continues".
  const discardCurrentCycle = useCallback(async () => {
    if (!activeSession) return;
    const ended = sessions
      .filter((s) => !s.isActive && s.endTime)
      .sort((a, b) => (b.endTime! < a.endTime! ? -1 : 1));
    const mostRecent = ended[0];
    await deleteDoc(userDoc(userId!, 'fastingSessions', activeSession.id));
    if (mostRecent) {
      await updateDoc(userDoc(userId!, 'fastingSessions', mostRecent.id), { endTime: null, isActive: true });
    }
    return mostRecent ?? null;
  }, [userId, activeSession, sessions]);

  return {
    sessions, loaded, activeSession,
    startFastingAt, endFasting, updateSession, removeSession, discardCurrentCycle,
  };
}
