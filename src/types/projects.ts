/**
 * A finite undertaking inside one pillar. See Notion "Core Concept".
 *
 * - goal: a statement of what success looks like.
 * - milestones: ordered checkpoints. Each is met once all of its criteria are
 *   met; the project is done once every milestone is met.
 * - criteria: one-off tasks (checkboxes) and/or habit targets ("bring habit X
 *   to ≥ N % over W weeks"). A habit target latches: once reached it stays met.
 *
 * Milestones live inside the project document: they're small, always loaded
 * with their project, and edited together.
 */

export interface TaskCriterion {
  kind: 'task';
  id: string;
  title: string;
  doneAt?: string;        // ISO datetime
}

export interface HabitCriterion {
  kind: 'habit';
  id: string;
  habitId: string;
  targetRate: number;     // percent of scheduled sessions that must be logged, 1..100
  windowWeeks: number;    // trailing window the rate is measured over
  metAt?: string;         // ISO yyyy-mm-dd; set the first time the target is reached (latched)
}

export type Criterion = TaskCriterion | HabitCriterion;

export interface Milestone {
  id: string;
  title: string;
  dueDate?: string;       // ISO yyyy-mm-dd
  criteria: Criterion[];
}

export interface Project {
  id: string;
  pillarId: string;
  name: string;
  goal: string;           // what success looks like
  deadline?: string;      // ISO yyyy-mm-dd
  milestones: Milestone[];
  /** Set while every milestone is met (or when completed by hand with no milestones). */
  completedAt?: string;   // ISO yyyy-mm-dd
  order: number;          // display position within its pillar
  createdAt: string;
}

export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'order'>;

export const DEFAULT_TARGET_RATE = 90;
export const DEFAULT_WINDOW_WEEKS = 4;

export function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
