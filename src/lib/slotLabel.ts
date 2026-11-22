import { addDays, fromISO, todayISO } from './schedule';
import type { SessionSlot } from './habitSchedule';

/** "Today · 08:00", "Yesterday · 22:00" or "Thu 19 Nov · 08:00" — shared by every habit list. */
export function slotDateLabel(slot: SessionSlot): string {
  const today = todayISO();
  const day = slot.date === today ? 'Today'
    : slot.date === addDays(today, -1) ? 'Yesterday'
    : fromISO(slot.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${slot.time}`;
}
