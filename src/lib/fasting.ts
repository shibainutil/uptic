import type { FastingSession, NutritionData, NutritionSettings } from '../types/nutrition';
import { earliestSitting } from '../types/nutrition';
import { todayISO, toISO, fromISO } from './schedule';

const HOUR_MS = 3_600_000;

export function addHoursISO(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * HOUR_MS).toISOString();
}

export function hoursBetween(aISO: string, bISO: string): number {
  return (new Date(aISO).getTime() - new Date(bISO).getTime()) / HOUR_MS;
}

export function endOfDayISO(dateISO: string): string {
  const d = fromISO(dateISO);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Nutrition entries whose earliest sitting falls after the fast's start time. */
export function entriesAfterFastStart(session: FastingSession, entries: NutritionData[]): NutritionData[] {
  return entries
    .filter((e) => earliestSitting(e) >= session.startTime)
    .sort((a, b) => earliestSitting(a).localeCompare(earliestSitting(b)));
}

export function firstNutritionAfterFast(session: FastingSession, entries: NutritionData[]): NutritionData | null {
  return entriesAfterFastStart(session, entries)[0] ?? null;
}

export function isInEatingWindow(session: FastingSession | null, entries: NutritionData[]): boolean {
  if (!session) return false;
  const first = firstNutritionAfterFast(session, entries);
  if (!first) return false;
  return earliestSitting(first) <= new Date().toISOString();
}

/** The "as of" time used for elapsed-duration math: now for today, else the session's end
 * (or end-of-day for still-active historical sessions). */
export function referenceTimeFor(session: FastingSession, dateISO: string): string {
  if (dateISO === todayISO()) return new Date().toISOString();
  return session.endTime ?? endOfDayISO(dateISO);
}

export interface DisplayDuration {
  ms: number;
  inEatingWindow: boolean;
}

export function displayDuration(session: FastingSession, entries: NutritionData[], dateISO: string): DisplayDuration {
  const ref = referenceTimeFor(session, dateISO);
  const inEatingWindow = isInEatingWindow(session, entries);
  if (inEatingWindow) {
    const first = firstNutritionAfterFast(session, entries)!;
    return { ms: new Date(ref).getTime() - new Date(earliestSitting(first)).getTime(), inEatingWindow };
  }
  return { ms: new Date(ref).getTime() - new Date(session.startTime).getTime(), inEatingWindow };
}

/** Hours actually fasted, used for milestone gating — distinct from the ring's displayed
 * duration, which switches to "time since first meal" once eating resumes. */
export function actualFastingHours(session: FastingSession, dateISO: string): number {
  const ref = referenceTimeFor(session, dateISO);
  if (dateISO !== todayISO() && session.endTime) {
    return hoursBetween(session.endTime, session.startTime);
  }
  return hoursBetween(ref, session.startTime);
}

export function formatHMS(ms: number): string {
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export interface MilestoneStatus {
  time: string;
  achieved: boolean;
  failed: boolean;
}

export interface Milestones {
  fatBurn: MilestoneStatus;
  dailyGoal: MilestoneStatus;
  bonusGoal: MilestoneStatus;
}

/** Milestone achievement per the source app's rule: enough real hours must have passed
 * AND no nutrition may have been logged before that milestone's target time. Failure
 * propagates forward — once one milestone fails, later ones fail too. */
export function computeMilestones(
  session: FastingSession,
  settings: NutritionSettings,
  entries: NutritionData[],
  dateISO: string,
): Milestones {
  const hours = actualFastingHours(session, dateISO);
  const after = entriesAfterFastStart(session, entries);

  function loggedBefore(timeISO: string): boolean {
    return after.some((e) => earliestSitting(e) < timeISO);
  }

  const fatBurnTime = addHoursISO(session.startTime, settings.fatBurnHours);
  const dailyGoalTime = addHoursISO(session.startTime, settings.dailyFastingGoalHours);
  const bonusGoalTime = addHoursISO(session.startTime, settings.bonusFastingGoalHours);

  const fatBurnFailed = loggedBefore(fatBurnTime);
  const fatBurnAchieved = hours >= settings.fatBurnHours && !fatBurnFailed;

  const dailyGoalFailed = fatBurnFailed || loggedBefore(dailyGoalTime);
  const dailyGoalAchieved = hours >= settings.dailyFastingGoalHours && !dailyGoalFailed;

  const bonusGoalFailed = dailyGoalFailed || loggedBefore(bonusGoalTime);
  const bonusGoalAchieved = hours >= settings.bonusFastingGoalHours && !bonusGoalFailed;

  return {
    fatBurn: { time: fatBurnTime, achieved: fatBurnAchieved, failed: fatBurnFailed },
    dailyGoal: { time: dailyGoalTime, achieved: dailyGoalAchieved, failed: dailyGoalFailed },
    bonusGoal: { time: bonusGoalTime, achieved: bonusGoalAchieved, failed: bonusGoalFailed },
  };
}

export interface RingStatus {
  text: string;
  color: string;
  hours: number;
}

const COLOR_EATING = '#3B82F6';
const COLOR_FAT_BURN = '#D84315';
const COLOR_DAILY_GOAL = '#FB8C00';
const COLOR_BONUS_GOAL = '#FFB300';
const COLOR_FASTING = '#E53935';

/** Center-of-ring status text/color. Mirrors the source app's priority order, including
 * its use of a hardcoded 12h fat-burn threshold for this text (vs. the configurable
 * settings.fatBurnHours used for milestone badges/bars elsewhere). */
export function ringStatus(
  session: FastingSession,
  settings: NutritionSettings,
  entries: NutritionData[],
  dateISO: string,
  isToday: boolean,
): RingStatus {
  const inEatingWindow = isInEatingWindow(session, entries);

  if (inEatingWindow) {
    const first = firstNutritionAfterFast(session, entries)!;
    const h = hoursBetween(earliestSitting(first), session.startTime);
    if (h >= settings.bonusFastingGoalHours) {
      return { text: `Bonus Goal (${Math.round(h)}h) Achieved! 🎉`, color: COLOR_BONUS_GOAL, hours: h };
    }
    if (h >= settings.dailyFastingGoalHours) {
      return {
        text: isToday
          ? `Daily Goal (${Math.round(h)}h) Achieved! Start new cycle when ready`
          : `Daily Goal (${Math.round(h)}h) Achieved!`,
        color: COLOR_DAILY_GOAL, hours: h,
      };
    }
    if (h >= 12) {
      return { text: `Fat burn reached (${Math.round(h)}h fasted)`, color: COLOR_FAT_BURN, hours: h };
    }
    return { text: `Eating window (${Math.round(h)}h fasted)`, color: COLOR_EATING, hours: h };
  }

  const h = actualFastingHours(session, dateISO);
  if (h >= settings.bonusFastingGoalHours) {
    return { text: 'Bonus Goal Achieved! 🎉', color: COLOR_BONUS_GOAL, hours: h };
  }
  if (h >= settings.dailyFastingGoalHours) {
    return {
      text: isToday ? 'Daily Goal Met! Log nutrition to start eating window' : 'Daily Goal Met!',
      color: COLOR_DAILY_GOAL, hours: h,
    };
  }
  if (h >= 12) {
    return { text: isToday ? 'Fat burning mode...' : 'Fat burning mode', color: COLOR_FAT_BURN, hours: h };
  }
  return { text: isToday ? 'Fasting in progress...' : 'Fasting', color: COLOR_FASTING, hours: h };
}

export function ringColorForHours(h: number, settings: NutritionSettings): string {
  if (h >= settings.bonusFastingGoalHours) return COLOR_BONUS_GOAL;
  if (h >= settings.dailyFastingGoalHours) return COLOR_DAILY_GOAL;
  if (h >= settings.fatBurnHours) return COLOR_FAT_BURN;
  return COLOR_FASTING;
}

/** The fasting session that was active during `dateISO`, mirroring the source app's
 * getFastingSessionForDate: prioritizes a session that started on an earlier day and
 * carried into this one (an overnight fast), else falls back to one that started today. */
export function sessionForDate(sessions: FastingSession[], dateISO: string): FastingSession | null {
  const startOfDay = fromISO(dateISO).toISOString();
  const endOfDay = endOfDayISO(dateISO);
  let sameDayMatch: FastingSession | null = null;

  const candidates = sessions
    .filter((s) => s.startTime <= endOfDay)
    .sort((a, b) => (a.startTime < b.startTime ? 1 : -1));

  for (const s of candidates) {
    const active = s.isActive || (!!s.endTime && s.endTime > startOfDay);
    if (!active) continue;
    if (toISO(new Date(s.startTime)) < dateISO) return s;
    sameDayMatch ??= s;
  }
  return sameDayMatch;
}

/** Total fasting hours across all sessions that overlap `dateISO`, each clipped to the
 * day's boundaries — mirrors the weekly day-card calculation in the source app. */
export function fastingHoursOverlappingDay(sessions: FastingSession[], dateISO: string): number {
  const dayStart = fromISO(dateISO).getTime();
  const dayEnd = dayStart + 24 * HOUR_MS;
  let total = 0;
  for (const s of sessions) {
    const start = new Date(s.startTime).getTime();
    const end = s.endTime ? new Date(s.endTime).getTime() : Date.now();
    const overlapStart = Math.max(start, dayStart);
    const overlapEnd = Math.min(end, dayEnd);
    if (overlapEnd > overlapStart) total += (overlapEnd - overlapStart) / HOUR_MS;
  }
  return total;
}

export { toISO, fromISO, todayISO };
