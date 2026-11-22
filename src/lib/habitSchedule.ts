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

/** Undo a paused session: end the pause covering `date` the day before, so neither that
 *  date nor anything after it stays paused. A pause starting on/after `date` is removed. */
export function endPauseFrom(habit: Habit, date: string): HabitPause[] {
  const p = pauseCovering(habit, date);
  if (!p) return habit.pauses ?? [];
  const rest = (habit.pauses ?? []).filter((x) => x !== p);
  return p.from < date ? [...rest, { from: p.from, until: addDays(date, -1) }] : rest;
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

export type ProgressPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'allTime';

/** Inclusive [start, end] ISO date bounds for the period containing `todayISO`. */
export function periodBounds(period: ProgressPeriod, todayISO: string): [string, string] {
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

export interface ProgressResult {
  rate: number; // 0..1
  completed: number;
  expected: number;
}

/** Progress for one habit over a period, clamped to [habit.startDate, today].
 *  Pass `nowTime` as "HH:MM" (24h) so today's future time-slots are excluded from expected. */
export function computeProgress(habit: Habit, entries: HabitLogEntry[], period: ProgressPeriod, todayISO: string, nowTime?: string): ProgressResult {
  const [periodStart, periodEndRaw] = period === 'allTime'
    ? [habit.startDate, todayISO]
    : periodBounds(period, todayISO);
  const start = periodStart < habit.startDate ? habit.startDate : periodStart;
  const end = periodEndRaw > todayISO ? todayISO : periodEndRaw;
  if (diffDays(end, start) < 0) return { rate: 0, completed: 0, expected: 0 };

  // Use only paused days (not skipped ones) as the exclusion filter: a skipped slot was
  // still on the schedule, so it counts as expected but not completed.
  const baseExpected = countScheduledSlots(habit.schedule, habit.startDate, start, end, (d) => isPaused(habit, d));
  // Subtract today's time slots that haven't been reached yet AND haven't been
  // explicitly handled (done or skipped) so the ring doesn't count genuinely
  // pending future sessions on the current day as already expected.
  const skippedSlotSet = new Set(habit.skippedSlots ?? []);
  const futureTodaySlots = (end === todayISO && nowTime != null && !isPaused(habit, todayISO) && isDue(habit.schedule, fromISO(todayISO), habit.startDate))
    ? (habit.schedule.timesOfDay ?? ['09:00']).filter((t) => {
        if (t <= nowTime) return false;
        // Already explicitly skipped → still counts as expected, don't subtract
        if (skippedSlotSet.has(`${todayISO}|${t}`) || (habit.skippedDates ?? []).includes(todayISO)) return false;
        return true;
      }).length
    : 0;
  const expected = baseExpected - futureTodaySlots;
  // Count completed slots per scheduled day, skipping entries whose exact slot key is
  // in skippedSlots (a slot that was done and then explicitly skipped stays skipped).
  // Also cap per-day count at slotsPerDay to avoid duplicate entries inflating the rate.
  const spd = slotsPerDay(habit.schedule);
  const mine = entries.filter((e) => e.habitId === habit.id);
  const skippedDatesSet = new Set(habit.skippedDates ?? []);
  const dueDatesInRange = enumerateDueDates(habit.schedule, habit.startDate, start, end)
    .filter((d) => !isPaused(habit, d));
  let completed = 0;
  for (const d of dueDatesInRange) {
    if (skippedDatesSet.has(d)) continue; // whole day skipped — 0 completions
    const count = mine.filter((e) => {
      if (entryDate(e) !== d) return false;
      const eDate = new Date(e.loggedAt);
      const hhmm = `${String(eDate.getHours()).padStart(2, '0')}:${String(eDate.getMinutes()).padStart(2, '0')}`;
      return !skippedSlotSet.has(`${d}|${hhmm}`);
    }).length;
    completed += Math.min(count, spd);
  }

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

/**
 * Today's unhandled sessions follow the clock: 'later' (shown as Upcoming) while the
 * scheduled time is more than DUE_WINDOW_MIN away, 'today' (Due) from DUE_WINDOW_MIN
 * before until DUE_WINDOW_MIN after it, then 'overdue'. 'upcoming' is a future day.
 */
export type SlotStatus = 'done' | 'skipped' | 'overdue' | 'today' | 'later' | 'upcoming' | 'paused';

export const DUE_WINDOW_MIN = 60;

/** Status of an unhandled session today at `time` ("HH:MM"), given the current moment. */
export function todaySlotStatus(time: string, now: Date): 'later' | 'today' | 'overdue' {
  const [h, m] = time.split(':').map(Number);
  const diff = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
  if (diff > DUE_WINDOW_MIN) return 'later';
  if (diff < -DUE_WINDOW_MIN) return 'overdue';
  return 'today';
}

export interface SessionSlot {
  key: string;
  date: string;     // ISO yyyy-mm-dd
  time: string;     // "HH:MM"
  status: SlotStatus;
  /** Logged on a day the schedule doesn't list (still counts toward totals). */
  extra?: boolean;
  /** True when the skip was explicitly set by the user (date is in skippedDates). False for auto-skipped past slots. */
  explicit?: boolean;
  /** For done slots: the log entry that fills this slot. */
  entryId?: string;
}

const PAST_SLOT_DAYS = 90;     // how far back unlogged / done slots are listed
const ONGOING_UPCOMING = 10;   // upcoming slots listed for habits without a session goal

/**
 * Past slots (done / skipped / missed) from the last ~90 days, today's slots, and
 * the upcoming slots still needed: for a habit with a session goal, exactly as
 * many as are left to reach it (skipped and paused dates excluded, so they push
 * the end later); otherwise the next 10. Scheduled days inside a pause are listed
 * too, with status 'paused'.
 */
/**
 * `through`: for habits without a session goal, keep listing upcoming slots at least up to
 * this date (the next 10 may not reach the end of the week for a busy habit).
 */
export function sessionSlots(
  habit: Habit, entries: HabitLogEntry[], todayISO_: string, through?: string, now: Date = new Date(),
): SessionSlot[] {
  const mine = entries.filter((e) => e.habitId === habit.id);
  const hhmmOf = (e: HabitLogEntry) => {
    const t = new Date(e.loggedAt);
    return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  };
  const entriesByDate = new Map<string, HabitLogEntry[]>();
  for (const e of [...mine].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))) {
    const d = entryDate(e);
    entriesByDate.set(d, [...(entriesByDate.get(d) ?? []), e]);
  }
  const skipped = new Set(habit.skippedDates ?? []);
  const skippedSlots = new Set(habit.skippedSlots ?? []);
  const times = (habit.schedule.timesOfDay ?? []).length ? habit.schedule.timesOfDay.slice().sort() : ['09:00'];
  const out: SessionSlot[] = [];

  // flexibleSchedule: every logged entry re-anchors the schedule for the days after it
  // (plants, haircut, etc.). The anchor for a date is the most recent entry date strictly
  // before it, so the schedule is a chain: start → each log → the next log. Using one
  // anchor (the latest log) for everything after it and startDate for everything before
  // it re-derived past days on the original grid, which turned done sessions on the
  // shifted grid into "extra" manual logs and resurrected phantom overdue slots.
  const flexLogDates = habit.flexibleSchedule
    ? [...new Set(mine.map((e) => entryDate(e)))].filter((d) => d > habit.startDate).sort()
    : [];
  const anchorFor = (d: string): string => {
    let anchor = habit.startDate;
    for (const ld of flexLogDates) {
      if (ld >= d) break;
      anchor = ld;
    }
    return anchor;
  };

  const pastStart = habit.startDate > addDays(todayISO_, -PAST_SLOT_DAYS) ? habit.startDate : addDays(todayISO_, -PAST_SLOT_DAYS);
  let pendingToday = 0;
  const coveredDates = new Set<string>();
  for (let d = pastStart; d <= todayISO_; d = addDays(d, 1)) {
    const anchor = anchorFor(d);
    if (!isDue(habit.schedule, fromISO(d), anchor)) continue;
    coveredDates.add(d);
    const paused_ = isPaused(habit, d);
    // Entries logged at a slot's exact time fill that slot. Any other entries that day
    // (edited times, manual logs) fill the remaining open slots in order; an entry with
    // count N can fill up to N slots.
    const dayEntries = entriesByDate.get(d) ?? [];
    const exact = new Map<string, HabitLogEntry>();
    const used = new Set<string>();
    for (const time of times) {
      const e = dayEntries.find((x) => !used.has(x.id) && hhmmOf(x) === time);
      if (e) { exact.set(time, e); used.add(e.id); }
    }
    const spare = dayEntries.filter((e) => !used.has(e.id)).flatMap((e) => Array(e.count ?? 1).fill(e) as HabitLogEntry[]);

    times.forEach((time) => {
      let status: SlotStatus;
      let explicit: boolean | undefined;
      let entry: HabitLogEntry | undefined;
      const isExplicitSkip = skippedSlots.has(`${d}|${time}`) || skipped.has(d);
      if (isExplicitSkip) { status = 'skipped'; explicit = true; }
      else if ((entry = exact.get(time) ?? spare.shift())) { status = 'done'; }
      else if (paused_) status = 'paused';
      else if (d === todayISO_) { status = todaySlotStatus(time, now); pendingToday++; }
      else status = 'overdue';
      if (entry) used.add(entry.id);
      out.push({
        key: `${d}|${time}`, date: d, time: entry ? hhmmOf(entry) : time, status, explicit, entryId: entry?.id,
      });
    });
    // Entries beyond the day's scheduled slots still get their own row.
    for (const e of dayEntries) {
      if (used.has(e.id)) continue;
      out.push({ key: `${d}|${hhmmOf(e)}|logged|${e.id}`, date: d, time: hhmmOf(e), status: 'done', extra: true, entryId: e.id });
    }
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
    out.push({ key: `${d}|${hh(e.loggedAt)}|logged`, date: d, time: hh(e.loggedAt), status: 'done', extra: true, entryId: e.id });
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
    let pausedAhead = 0;
    for (let i = 0; i < 800 && (pending < remaining || forced(cursor)); i++, cursor = addDays(cursor, 1)) {
      if (!isDue(habit.schedule, fromISO(cursor), anchorFor(cursor))) continue;
      // Paused days keep their sessions on the schedule, marked paused: they aren't due,
      // can't go overdue and don't count toward the remaining sessions, so a session goal
      // still finishes later. An open-ended pause would repeat forever, so only list
      // its next few sessions.
      const pause = pauseCovering(habit, cursor);
      if (pause) {
        if (pause.until == null && pausedAhead >= ONGOING_UPCOMING && !forced(cursor)) break;
        for (const time of times) {
          const skippedHere = skippedSlots.has(`${cursor}|${time}`) || skipped.has(cursor);
          out.push({ key: `${cursor}|${time}`, date: cursor, time, status: skippedHere ? 'skipped' : 'paused', explicit: skippedHere || undefined });
          pausedAhead++;
        }
        continue;
      }
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
