import { toISO, fromISO, addDays, diffDays } from './schedule';
import { isHabitComplete, totalSessions, type Habit, type HabitLogEntry, type HabitPause, type HabitSchedule } from '../types/habits';

// ── Due-date logic ───────────────────────────────────────────────────────────

function mondayOf(iso: string): string {
  const offset = (fromISO(iso).getDay() + 6) % 7; // 0=Mon..6=Sun
  return addDays(iso, -offset);
}

// month/quarter/year are all "same day-of-month, every N months" — just with a
// different number of months per unit.
function monthsPerUnit(unit: HabitSchedule['unit']): number {
  switch (unit) {
    case 'quarter': return 3;
    case 'year': return 12;
    default: return 1;
  }
}

export function isDue(schedule: HabitSchedule, d: Date, startISO: string): boolean {
  const iso = toISO(d);
  const interval = schedule.interval || 1;
  switch (schedule.unit) {
    case 'day': {
      const offset = diffDays(iso, startISO);
      return offset >= 0 && offset % interval === 0;
    }
    case 'week': {
      if (!(schedule.daysOfWeek ?? []).includes(d.getDay())) return false;
      const weekOffset = diffDays(mondayOf(iso), mondayOf(startISO)) / 7;
      return weekOffset >= 0 && Number.isInteger(weekOffset) && weekOffset % interval === 0;
    }
    case 'month':
    case 'quarter':
    case 'year': {
      if (schedule.dayOfMonth == null || d.getDate() !== schedule.dayOfMonth) return false;
      const start = fromISO(startISO);
      const monthOffset = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());
      const span = interval * monthsPerUnit(schedule.unit);
      return monthOffset >= 0 && monthOffset % span === 0;
    }
    default:
      return false;
  }
}

const MAX_ITERATIONS = 20000; // ~54 years of daily iteration; generous for "all time" ranges

/** Every due date (ISO) for a schedule from max(startISO, fromISO) through untilISO inclusive. */
export function enumerateDueDates(schedule: HabitSchedule, startISO: string, fromISO_: string, untilISO: string): string[] {
  let cursor = diffDays(fromISO_, startISO) > 0 ? fromISO_ : startISO;
  const out: string[] = [];
  let guard = 0;
  while (diffDays(cursor, untilISO) <= 0 && guard++ < MAX_ITERATIONS) {
    if (isDue(schedule, fromISO(cursor), startISO)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

// ── Pauses and skips ────────────────────────────────────────────────────────

/** The pause covering this date, if any. */
export function pauseCovering(habit: Habit, iso: string): HabitPause | undefined {
  return (habit.pauses ?? []).find((p) => iso >= p.from && (p.until == null || iso <= p.until));
}

export const isPaused = (habit: Habit, iso: string): boolean => pauseCovering(habit, iso) !== undefined;

/** Not scheduled: paused, or skipped by the user. */
export const isOff = (habit: Habit, iso: string): boolean =>
  isPaused(habit, iso) || (habit.skippedDates ?? []).includes(iso);

/** Add a pause, merging it with any pause it overlaps or touches. */
export function withPause(pauses: HabitPause[], from: string, until?: string): HabitPause[] {
  let lo = from;
  let hi: string | undefined = until;
  const rest: HabitPause[] = [];
  for (const p of pauses) {
    const overlaps = (hi == null || p.from <= addDays(hi, 1)) && (p.until == null || p.until >= addDays(lo, -1));
    if (!overlaps) { rest.push(p); continue; }
    if (p.from < lo) lo = p.from;
    hi = hi == null || p.until == null ? undefined : (p.until > hi ? p.until : hi);
  }
  const merged: HabitPause = hi == null ? { from: lo } : { from: lo, until: hi };
  return [...rest, merged].sort((a, b) => a.from.localeCompare(b.from));
}

/** Resume: end the current pause so it no longer covers today. The pause's until is set
 *  to yesterday so pauseCovering(today) returns undefined after the call. If the pause
 *  started today or later, it is removed entirely. */
export function withoutCurrentPause(habit: Habit, todayISO_: string): HabitPause[] {
  const yesterday = addDays(todayISO_, -1);
  return (habit.pauses ?? []).flatMap((p) => {
    if (!(todayISO_ >= p.from && (p.until == null || todayISO_ <= p.until))) return [p];
    return p.from >= todayISO_ ? [] : [{ from: p.from, until: yesterday }];
  });
}

/** Modify habit pauses to uncover a single date — undo a paused session by adjusting or splitting the pause. */
export function splitPauseAt(habit: Habit, date: string): HabitPause[] {
  const p = pauseCovering(habit, date);
  if (!p) return habit.pauses ?? [];
  const rest = (habit.pauses ?? []).filter((x) => x !== p);
  const before: HabitPause | null = p.from < date ? { from: p.from, until: addDays(date, -1) } : null;
  const after: HabitPause | null = (p.until == null || p.until > date)
    ? (p.until ? { from: addDays(date, 1), until: p.until } : { from: addDays(date, 1) })
    : null;
  return [...rest, ...(before ? [before] : []), ...(after ? [after] : [])];
}

/** How many (date × time-of-day) occurrences a schedule produces in [from, until], minus `off` dates. */
export function countScheduledSlots(
  schedule: HabitSchedule, startISO: string, fromISO_: string, untilISO: string, off?: (iso: string) => boolean,
): number {
  if (diffDays(untilISO, fromISO_) < 0) return 0;
  const dueDates = enumerateDueDates(schedule, startISO, fromISO_, untilISO).filter((d) => !off?.(d));
  return dueDates.length * slotsPerDay(schedule);
}

export function slotsPerDay(schedule: HabitSchedule): number {
  return Math.max(1, (schedule.timesOfDay ?? []).length);
}

// ── Occurrences ahead (skips, session-count projections) ───────────────────

/** Local calendar date (yyyy-mm-dd) of a log entry. */
export function entryDate(e: HabitLogEntry): string {
  return toISO(new Date(e.loggedAt));
}

/** Sessions logged for a habit on or after `sinceISO` (local dates). */
export function sessionsSince(habit: Habit, entries: HabitLogEntry[], sinceISO: string): number {
  return totalSessions(entries.filter((e) => e.habitId === habit.id && entryDate(e) >= sinceISO));
}

/**
 * Upcoming scheduled dates from today on, skipping skipped dates and today once
 * today's sessions are all logged. Stops after `limit` dates or ~2 years.
 */
export function upcomingDates(habit: Habit, entries: HabitLogEntry[], todayISO_: string, limit: number): string[] {
  const loggedToday = totalSessions(entries.filter((e) => e.habitId === habit.id && entryDate(e) === todayISO_));
  const out: string[] = [];
  let cursor = habit.startDate > todayISO_ ? habit.startDate : todayISO_;
  for (let i = 0; i < 800 && out.length < limit; i++, cursor = addDays(cursor, 1)) {
    if (isOff(habit, cursor) || !isDue(habit.schedule, fromISO(cursor), habit.startDate)) continue;
    if (cursor === todayISO_ && loggedToday >= slotsPerDay(habit.schedule)) continue;
    out.push(cursor);
  }
  return out;
}

/** The date the `remaining`-th upcoming session falls on, if the schedule reaches it within ~2 years. */
export function projectedFinish(habit: Habit, entries: HabitLogEntry[], todayISO_: string, remaining: number): string | undefined {
  if (remaining <= 0) return undefined;
  const dates = upcomingDates(habit, entries, todayISO_, Math.ceil(remaining / slotsPerDay(habit.schedule)));
  return dates.length * slotsPerDay(habit.schedule) >= remaining ? dates[dates.length - 1] : undefined;
}

// ── Human-readable description ───────────────────────────────────────────────

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const UNIT_LABEL: Record<HabitSchedule['unit'], [string, string]> = {
  day: ['Daily', 'days'],
  week: ['Weekly', 'weeks'],
  month: ['Monthly', 'months'],
  quarter: ['Quarterly', 'quarters'],
  year: ['Yearly', 'years'],
};

/** e.g. "Daily at 08:00", "Weekly · Mon, Wed at 18:00", "Every 2 quarters · 1st at 09:00". */
export function describeSchedule(schedule: HabitSchedule): string {
  const n = schedule.interval || 1;
  const [plainLabel, unitPlural] = UNIT_LABEL[schedule.unit];
  let base: string;
  if (schedule.unit === 'week') {
    const days = (schedule.daysOfWeek ?? []).slice().sort((a, b) => a - b).map((d) => WEEKDAY_ABBR[d]);
    const prefix = n === 1 ? plainLabel : `Every ${n} ${unitPlural}`;
    base = days.length ? `${prefix} · ${days.join(', ')}` : prefix;
  } else if (schedule.unit === 'day') {
    base = n === 1 ? plainLabel : `Every ${n} ${unitPlural}`;
  } else {
    const prefix = n === 1 ? plainLabel : `Every ${n} ${unitPlural}`;
    base = schedule.dayOfMonth != null ? `${prefix} · ${ordinal(schedule.dayOfMonth)}` : prefix;
  }
  const times = (schedule.timesOfDay ?? []).length ? ` at ${schedule.timesOfDay.join(', ')}` : '';
  return `${base}${times}`;
}

// ── Progress rings ───────────────────────────────────────────────────────────

export type RingPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'allTime';

/** Inclusive [start, end] ISO date bounds for the period containing `todayISO`. */
export function periodBounds(period: RingPeriod, todayISO: string): [string, string] {
  const d = fromISO(todayISO);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (period) {
    case 'day':
      return [todayISO, todayISO];
    case 'week': {
      const monday = mondayOf(todayISO);
      return [monday, addDays(monday, 6)];
    }
    case 'month': {
      const first = toISO(new Date(y, m, 1));
      const last = toISO(new Date(y, m + 1, 0));
      return [first, last];
    }
    case 'quarter': {
      const qStart = Math.floor(m / 3) * 3;
      const first = toISO(new Date(y, qStart, 1));
      const last = toISO(new Date(y, qStart + 3, 0));
      return [first, last];
    }
    case 'year': {
      return [toISO(new Date(y, 0, 1)), toISO(new Date(y, 11, 31))];
    }
    case 'allTime':
      return [todayISO, todayISO]; // caller substitutes habit.startDate as the real lower bound
  }
}

export interface RingResult {
  rate: number; // 0..1
  completed: number;
  expected: number;
}

/** Progress for one habit over one ring period, clamped to [habit.startDate, today].
 *  Pass `nowTime` as "HH:MM" (24h) so today's future time-slots are excluded from expected. */
export function computeRing(habit: Habit, entries: HabitLogEntry[], period: RingPeriod, todayISO: string, nowTime?: string): RingResult {
  const [periodStart, periodEndRaw] = period === 'allTime'
    ? [habit.startDate, todayISO]
    : periodBounds(period, todayISO);
  const start = periodStart < habit.startDate ? habit.startDate : periodStart;
  const end = periodEndRaw > todayISO ? todayISO : periodEndRaw;
  if (diffDays(end, start) < 0) return { rate: 0, completed: 0, expected: 0 };

  const baseExpected = countScheduledSlots(habit.schedule, habit.startDate, start, end, (d) => isOff(habit, d));
  // Subtract today's time slots that haven't been reached yet so the ring doesn't
  // count future sessions on the current day as already expected.
  const futureTodaySlots = (end === todayISO && nowTime != null && !isOff(habit, todayISO) && isDue(habit.schedule, fromISO(todayISO), habit.startDate))
    ? (habit.schedule.timesOfDay ?? ['09:00']).filter((t) => t > nowTime).length
    : 0;
  const expected = baseExpected - futureTodaySlots;
  const rangeEndExclusive = addDays(end, 1);
  const completed = totalSessions(entries.filter(
    (e) => e.habitId === habit.id && e.loggedAt >= start && e.loggedAt < rangeEndExclusive,
  ));

  const rate = expected > 0 ? Math.min(completed / expected, 1) : (completed > 0 ? 1 : 0);
  return { rate, completed, expected };
}

// ── Rolling-window counts (used by project habit targets) ───────────────────

/** Sessions completed vs. scheduled for one habit in [from, until], clamped to its start date and today. */
export function habitWindowCounts(habit: Habit, entries: HabitLogEntry[], fromISO_: string, untilISO: string) {
  const start = fromISO_ < habit.startDate ? habit.startDate : fromISO_;
  if (diffDays(untilISO, start) < 0) return { completed: 0, expected: 0 };
  const expected = countScheduledSlots(habit.schedule, habit.startDate, start, untilISO, (d) => isOff(habit, d));
  const endExclusive = addDays(untilISO, 1);
  const logged = totalSessions(entries.filter(
    (e) => e.habitId === habit.id && e.loggedAt >= start && e.loggedAt < endExclusive,
  ));
  // Logging extra sessions can't push the rate past 100 %.
  return { completed: Math.min(logged, expected), expected };
}

// ── Scheduled sessions (what the habit's sessions screen lists) ─────────────
// Nothing is stored per slot: slots are derived from the schedule, the logged
// entries and the skipped dates, so editing the schedule or skipping a day just
// reshuffles them. Marking a slot done logs an ordinary entry; skipping adds the
// date to `skippedDates`.

export type SlotStatus = 'done' | 'skipped' | 'overdue' | 'today' | 'upcoming' | 'paused';

export interface SessionSlot {
  key: string;
  date: string;     // ISO yyyy-mm-dd
  time: string;     // "HH:MM"
  status: SlotStatus;
  /** Logged on a day the schedule doesn't list (still counts toward totals). */
  extra?: boolean;
  /** True when the skip was explicitly set by the user (date is in skippedDates). False for auto-skipped past slots. */
  explicit?: boolean;
}

const PAST_SLOT_DAYS = 90;     // how far back unlogged / done slots are listed
const ONGOING_UPCOMING = 10;   // upcoming slots listed for habits without a session goal

/**
 * Past slots (done / skipped / missed) from the last ~90 days, today's slots, and
 * the upcoming slots still needed: for a habit with a session goal, exactly as
 * many as are left to reach it (skipped dates excluded, so they push the end
 * later); otherwise the next 10.
 */
/**
 * `through`: for habits without a session goal, keep listing upcoming slots at least up to
 * this date (the next 10 may not reach the end of the week for a busy habit).
 */
export function sessionSlots(habit: Habit, entries: HabitLogEntry[], todayISO_: string, through?: string): SessionSlot[] {
  const mine = entries.filter((e) => e.habitId === habit.id);
  const loggedByDate = new Map<string, number>();
  for (const e of mine) loggedByDate.set(entryDate(e), (loggedByDate.get(entryDate(e)) ?? 0) + (e.count ?? 1));
  // For past dates: match entries to slots by exact HH:MM so multi-session days
  // don't bleed across slots (markDone sets loggedAt to the slot's exact time for past dates).
  const loggedBySlotTime = new Map<string, number>();
  for (const e of mine) {
    const d = entryDate(e);
    const eDate = new Date(e.loggedAt);
    const hhmm = `${String(eDate.getHours()).padStart(2, '0')}:${String(eDate.getMinutes()).padStart(2, '0')}`;
    const key = `${d}|${hhmm}`;
    loggedBySlotTime.set(key, (loggedBySlotTime.get(key) ?? 0) + (e.count ?? 1));
  }
  const skipped = new Set(habit.skippedDates ?? []);
  const skippedSlots = new Set(habit.skippedSlots ?? []);
  const times = (habit.schedule.timesOfDay ?? []).length ? habit.schedule.timesOfDay.slice().sort() : ['09:00'];
  const out: SessionSlot[] = [];

  // flexibleSchedule: re-anchor due dates from the last logged entry so an
  // ad-hoc session shifts the upcoming schedule (plants, haircut, etc.).
  // Computed before the loops so it also applies to today's slot.
  let flexAnchor = habit.startDate;
  let lastLoggedDate: string | null = null;
  if (habit.flexibleSchedule && mine.length > 0) {
    lastLoggedDate = mine.map((e) => entryDate(e)).sort().at(-1)!;
    if (lastLoggedDate > habit.startDate) flexAnchor = lastLoggedDate;
  }

  const pastStart = habit.startDate > addDays(todayISO_, -PAST_SLOT_DAYS) ? habit.startDate : addDays(todayISO_, -PAST_SLOT_DAYS);
  const yesterday = addDays(todayISO_, -1);
  let pendingToday = 0;
  const coveredDates = new Set<string>();
  for (let d = pastStart; d <= todayISO_; d = addDays(d, 1)) {
    // For flexible habits: dates strictly after the last log use the new anchor,
    // so today's slot disappears if it's not due under the shifted schedule.
    const anchor = (lastLoggedDate && d > lastLoggedDate) ? lastLoggedDate : habit.startDate;
    if (!isDue(habit.schedule, fromISO(d), anchor)) continue;
    coveredDates.add(d);
    const paused_ = isPaused(habit, d);
    const logged = loggedByDate.get(d) ?? 0;

    // Match entries to slots by exact HH:MM — markDone always writes loggedAt at
    // the slot's scheduled time, so each slot can be identified independently.
    // Unmatched count (bulk entries or legacy data) falls back to filling remaining
    // non-skipped slots in order.
    const matched = new Set<string>();
    let unmatchedCount = logged;
    for (const time of times) {
      const c = loggedBySlotTime.get(`${d}|${time}`) ?? 0;
      if (c > 0) { matched.add(time); unmatchedCount -= c; }
    }
    unmatchedCount = Math.max(0, unmatchedCount);

    times.forEach((time) => {
      let status: SlotStatus;
      let explicit: boolean | undefined;
      const isExplicitSkip = skippedSlots.has(`${d}|${time}`) || skipped.has(d);
      if (isExplicitSkip) { status = 'skipped'; explicit = true; }
      else if (matched.has(time)) { status = 'done'; }
      else if (unmatchedCount > 0) { status = 'done'; unmatchedCount--; }
      else if (paused_) status = 'paused';
      else if (d === todayISO_) { status = 'today'; pendingToday++; }
      else status = 'overdue';
      out.push({ key: `${d}|${time}`, date: d, time, status, explicit });
    });
  }

  // Sessions logged on days the schedule doesn't list would otherwise be invisible.
  const hh = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const seenExtra = new Set<string>();
  for (const e of mine) {
    const d = entryDate(e);
    if (d < pastStart || d > todayISO_ || seenExtra.has(d) || coveredDates.has(d)) continue;
    seenExtra.add(d);
    out.push({ key: `${d}|${hh(e.loggedAt)}|logged`, date: d, time: hh(e.loggedAt), status: 'done', extra: true });
  }

  const completedCount = totalSessions(mine);
  const done = habit.archived || isHabitComplete(habit, completedCount, todayISO_);

  if (!done) {
    const remaining = habit.kind === 'limited' && habit.targetSessions != null
      ? Math.max(0, habit.targetSessions - completedCount) - pendingToday
      : ONGOING_UPCOMING;
    let pending = 0;
    let cursor = addDays(todayISO_, 1);
    const goalLimited = habit.kind === 'limited' && habit.targetSessions != null;
    const forced = (d: string) => !goalLimited && through != null && d <= through;
    for (let i = 0; i < 800 && (pending < remaining || forced(cursor)); i++, cursor = addDays(cursor, 1)) {
      if (!isDue(habit.schedule, fromISO(cursor), flexAnchor) || isPaused(habit, cursor)) continue;
      for (const time of times) {
        if (skippedSlots.has(`${cursor}|${time}`) || skipped.has(cursor)) { out.push({ key: `${cursor}|${time}`, date: cursor, time, status: 'skipped', explicit: true }); continue; }
        if (pending >= remaining && !forced(cursor)) break;
        out.push({ key: `${cursor}|${time}`, date: cursor, time, status: 'upcoming' });
        pending++;
      }
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
