/**
 * Hand-off from "Create new habit" in the milestone editor: the habit form is a
 * separate route, so once it creates the habit it parks the result here, and
 * the milestone editor picks it up when it regains focus and links it.
 */
export interface PendingHabitLink {
  habitId: string;
  startDate: string;
  targetSessions?: number;
}

let pending: PendingHabitLink | null = null;

export function setPendingHabitLink(link: PendingHabitLink) {
  pending = link;
}

export function takePendingHabitLink(): PendingHabitLink | null {
  const link = pending;
  pending = null;
  return link;
}
