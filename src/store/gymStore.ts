import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { useEffect, useState, useCallback } from 'react';
import { db } from '../firebase';
import type { Exercise, TrainingModule, TrainingCycle, ExerciseExecution } from '../types/gym';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function userCol(uid: string, col: string) {
  return collection(db, 'users', uid, col);
}

function userDoc(uid: string, col: string, id: string) {
  return doc(db, 'users', uid, col, id);
}

// ── Exercises ──────────────────────────────────────────────────────────────

export function useExercises(userId: string) {
  const [exercises, setExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(userCol(userId, 'exercises'), (snap) => {
      setExercises(snap.docs.map((d) => d.data() as Exercise));
    });
    return unsub;
  }, [userId]);

  const add = useCallback(async (data: Omit<Exercise, 'id' | 'createdAt'>) => {
    const id = uid();
    await setDoc(userDoc(userId, 'exercises', id), { ...data, id, createdAt: new Date().toISOString() });
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<Exercise>) => {
    await updateDoc(userDoc(userId, 'exercises', id), data as Record<string, unknown>);
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(userDoc(userId, 'exercises', id));
  }, [userId]);

  return { exercises, add, update, remove };
}

// ── Training Modules ───────────────────────────────────────────────────────

export function useModules(userId: string) {
  const [modules, setModules] = useState<TrainingModule[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(userCol(userId, 'modules'), (snap) => {
      setModules(snap.docs.map((d) => d.data() as TrainingModule));
    });
    return unsub;
  }, [userId]);

  const add = useCallback(async (data: Omit<TrainingModule, 'id' | 'createdAt'>) => {
    const id = uid();
    await setDoc(userDoc(userId, 'modules', id), { ...data, id, createdAt: new Date().toISOString() });
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<TrainingModule>) => {
    await updateDoc(userDoc(userId, 'modules', id), data as Record<string, unknown>);
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(userDoc(userId, 'modules', id));
  }, [userId]);

  const addExecution = useCallback(async (moduleId: string, exec: Omit<ExerciseExecution, 'id'>) => {
    const mod = (await import('firebase/firestore')).getDoc(userDoc(userId, 'modules', moduleId));
    const current = ((await mod).data() as TrainingModule);
    const newExec: ExerciseExecution = { ...exec, id: uid() };
    await updateDoc(userDoc(userId, 'modules', moduleId), {
      executions: [...current.executions, newExec],
    });
  }, [userId]);

  const updateExecution = useCallback(async (moduleId: string, execId: string, data: Partial<ExerciseExecution>, currentExecutions: ExerciseExecution[]) => {
    const updated = currentExecutions.map((e) => e.id === execId ? { ...e, ...data } : e);
    await updateDoc(userDoc(userId, 'modules', moduleId), { executions: updated });
  }, [userId]);

  const removeExecution = useCallback(async (moduleId: string, execId: string, currentExecutions: ExerciseExecution[]) => {
    const updated = currentExecutions.filter((e) => e.id !== execId);
    await updateDoc(userDoc(userId, 'modules', moduleId), { executions: updated });
  }, [userId]);

  return { modules, add, update, remove, addExecution, updateExecution, removeExecution };
}

// ── Training Cycles ────────────────────────────────────────────────────────

export function useCycles(userId: string) {
  const [cycles, setCycles] = useState<TrainingCycle[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(userCol(userId, 'cycles'), (snap) => {
      setCycles(snap.docs.map((d) => d.data() as TrainingCycle));
    });
    return unsub;
  }, [userId]);

  const add = useCallback(async (data: Omit<TrainingCycle, 'id' | 'createdAt'>) => {
    const id = uid();
    await setDoc(userDoc(userId, 'cycles', id), { ...data, id, createdAt: new Date().toISOString() });
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<TrainingCycle>) => {
    await updateDoc(userDoc(userId, 'cycles', id), data as Record<string, unknown>);
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(userDoc(userId, 'cycles', id));
  }, [userId]);

  return { cycles, add, update, remove };
}
