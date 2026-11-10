import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useState, useCallback, useRef } from 'react';
import { db } from '../firebase';
import {
  DEFAULT_TARGET_RATE, DEFAULT_WINDOW_WEEKS, newId,
  type Criterion, type Milestone, type Project, type ProjectInput,
} from '../types/projects';

const PROJECTS_COL = 'projects';

function projectDoc(userId: string, id: string) {
  return doc(db, 'users', userId, PROJECTS_COL, id);
}

/** Firestore rejects undefined anywhere in a document, including inside arrays of maps. */
function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)]),
    ) as T;
  }
  return value;
}

/** Top-level patch: undefined clears the field, nested values are cleaned. */
function toUpdate(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === undefined ? deleteField() : clean(v)]));
}

export function useProjects(userId: string | null | undefined) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setProjects([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(collection(db, 'users', userId, PROJECTS_COL), (snap) => {
      const list = snap.docs.map((d) => ({ milestones: [], ...d.data() }) as unknown as Project);
      list.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
      setProjects(list);
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const nextOrder = useCallback((pillarId: string) => {
    const siblings = projects.filter((p) => p.pillarId === pillarId);
    return siblings.length ? Math.max(...siblings.map((p) => p.order)) + 1 : 0;
  }, [projects]);

  const add = useCallback(async (data: ProjectInput): Promise<string> => {
    const id = newId();
    const docData: Project = { ...data, id, order: nextOrder(data.pillarId), createdAt: new Date().toISOString() };
    await setDoc(projectDoc(userId!, id), clean(docData));
    return id;
  }, [userId, nextOrder]);

  /** Pass a field as undefined to clear it. Moving to another pillar appends it there. */
  const update = useCallback(async (id: string, data: Partial<ProjectInput>) => {
    const current = projects.find((p) => p.id === id);
    const patch: Partial<Project> = { ...data };
    if (current && data.pillarId && data.pillarId !== current.pillarId) patch.order = nextOrder(data.pillarId);
    await updateDoc(projectDoc(userId!, id), toUpdate(patch));
  }, [userId, projects, nextOrder]);

  /** Persists a new order within one pillar: `ids` are that pillar's project ids in their new order. */
  const reorder = useCallback(async (ids: string[]) => {
    const batch = writeBatch(db);
    ids.forEach((id, i) => {
      const p = projects.find((x) => x.id === id);
      if (p && p.order !== i) batch.update(projectDoc(userId!, id), { order: i });
    });
    await batch.commit();
  }, [userId, projects]);

  // TODO(tasks module): standalone one-off tasks will live outside projects.
  const remove = useCallback(async (id: string) => {
    await deleteDoc(projectDoc(userId!, id));
  }, [userId]);

  // ── Milestones (stored inside the project document) ──────────────────────

  const writeMilestones = useCallback(async (projectId: string, fn: (ms: Milestone[]) => Milestone[]) => {
    const p = projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Project not found.');
    await updateDoc(projectDoc(userId!, projectId), { milestones: clean(fn(p.milestones)) });
  }, [userId, projects]);

  /** Inserts or replaces a milestone (matched by id); new ones are appended. */
  const saveMilestone = useCallback((projectId: string, m: Milestone) => writeMilestones(projectId, (ms) => (
    ms.some((x) => x.id === m.id) ? ms.map((x) => (x.id === m.id ? m : x)) : [...ms, m]
  )), [writeMilestones]);

  const removeMilestone = useCallback((projectId: string, milestoneId: string) => writeMilestones(
    projectId, (ms) => ms.filter((x) => x.id !== milestoneId),
  ), [writeMilestones]);

  const reorderMilestones = useCallback((projectId: string, ids: string[]) => writeMilestones(
    projectId, (ms) => ids.map((id) => ms.find((m) => m.id === id)).filter((m): m is Milestone => !!m),
  ), [writeMilestones]);

  /** Ticks or unticks one task. */
  const setTaskDone = useCallback((projectId: string, milestoneId: string, taskId: string, done: boolean) => writeMilestones(
    projectId, (ms) => ms.map((m) => (m.id !== milestoneId ? m : {
      ...m,
      criteria: m.criteria.map((c): Criterion => (
        c.kind === 'task' && c.id === taskId ? { ...c, doneAt: done ? new Date().toISOString() : undefined } : c
      )),
    })),
  ), [writeMilestones]);

  /** Writes latches computed by pendingLatches (habit targets reached, completedAt). */
  const applyLatches = useCallback(async (projectId: string, data: Pick<Project, 'milestones' | 'completedAt'>) => {
    await updateDoc(projectDoc(userId!, projectId), toUpdate(data));
  }, [userId]);

  return {
    projects, loaded, add, update, reorder, remove,
    saveMilestone, removeMilestone, reorderMilestones, setTaskDone, applyLatches,
  };
}

// ── One-time migration: Goals → Projects ─────────────────────────────────────
// Goals briefly existed (users/{uid}/goals, habits linked via goalId). Each goal
// becomes a project with the same pillar/name/deadline/order. A maintenance goal's
// linked habits become one milestone of habit targets with the goal's old
// rate/window. Then the goal docs and habit goalId fields are removed. Idempotent:
// it only finds anything to do while goal docs still exist.
const HABITS_COL = 'cleaningTasks'; // legacy habits collection name, see habitStore

export function useMigrateGoalsToProjects(userId: string | null | undefined) {
  const ran = useRef(false);
  useEffect(() => {
    if (!userId || ran.current) return;
    ran.current = true;
    (async () => {
      const [goalSnap, habitSnap] = await Promise.all([
        getDocs(collection(db, 'users', userId, 'goals')),
        getDocs(collection(db, 'users', userId, HABITS_COL)),
      ]);
      const linkedHabits = habitSnap.docs.filter((d) => d.data().goalId);
      if (goalSnap.empty && linkedHabits.length === 0) return;

      const batch = writeBatch(db);
      goalSnap.docs.forEach((d) => {
        const g = d.data() as Record<string, any>;
        const habitIds = linkedHabits.filter((h) => h.data().goalId === g.id).map((h) => h.id);
        const milestones: Milestone[] = habitIds.length ? [{
          id: newId(),
          title: g.mode === 'maintenance' ? 'Keep it up' : 'Habits',
          criteria: habitIds.map((habitId) => ({
            kind: 'habit' as const,
            id: newId(),
            habitId,
            targetRate: g.targetRate ?? DEFAULT_TARGET_RATE,
            windowWeeks: g.windowWeeks ?? DEFAULT_WINDOW_WEEKS,
          })),
        }] : [];
        const project: Project = {
          id: g.id,
          pillarId: g.pillarId,
          name: g.name,
          goal: g.description ?? '',
          deadline: g.deadline,
          milestones,
          completedAt: milestones.length ? undefined : g.achievedAt,
          order: g.order ?? 0,
          createdAt: g.createdAt ?? new Date().toISOString(),
        };
        batch.set(projectDoc(userId, g.id), clean(project));
        batch.delete(d.ref);
      });
      linkedHabits.forEach((h) => batch.update(h.ref, { goalId: deleteField() }));
      await batch.commit();
    })().catch(() => { ran.current = false; /* retry on next mount */ });
  }, [userId]);
}
