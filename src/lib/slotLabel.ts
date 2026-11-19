import { fromISO } from './schedule';
import type { SessionSlot } from './habitSchedule';

/** "Today · 08:00", "Yesterday · 22:00" or "Thu 19 Nov · 08:00" — shared by every habit list. */
export function slotDateLabel(slot: SessionSlot): string {
  const day = slot.status === 'overdue' ? 'Yesterday'
    : slot.status === 'today' ? 'Today'
    : fromISO(slot.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${slot.time}`;
}
