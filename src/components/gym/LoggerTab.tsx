import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet, Alert, Modal as RNModal } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  useRoutines, useRoutineExecutions, useExercises, useExerciseExecutions,
} from '../../store/gymStore';
import { toISO, todayISO, diffDays } from '../../lib/schedule';
import { useKeyboardHeight } from '../../lib/useKeyboardHeight';
import { type Exercise, type RoutineExecution, exerciseType, exerciseMuscleGroup, effectiveExerciseIds, exerciseRole } from '../../types/gym';
import { colors, font, spacing, radius } from '../../theme';
import { ExerciseInlineForm } from './ExerciseInlineForm';
import { CalendarModal } from '../ui/CalendarModal';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Context-menu geometry: fixed card width + close-row height let us position the
// card so its X icon lands exactly on the dots button, regardless of tap position.
const MENU_CARD_WIDTH = 200;
const MENU_CLOSE_HEIGHT = 18;
const MENU_X_OFFSET_FROM_RIGHT = 19; // paddingHorizontal + iconSize/2 of the close row
const RESCHEDULE_COLOR = '#A855F7'; // kept purple independent of colors.accent (which is blue)
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_COLOR = {
  pending: '#3B82F6',
  'in-progress': '#EAB308',
  incomplete: '#A855F7',
  completed: '#22C55E',
  failed: colors.danger,
} as const;

type DisplayStatus = keyof typeof STATUS_COLOR;

// Shown as a solid-background star badge when at least one optional set is completed.
const PERFECT_COLOR = '#00875A';


function dayGroupLabel(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function exerciseBadge(ex: Exercise): string {
  return exerciseType(ex) === 'cardio' ? 'Cardio' : exerciseMuscleGroup(ex);
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function renderDot(status: DisplayStatus, key: number) {
  return <View key={key} style={[styles.dot, { backgroundColor: STATUS_COLOR[status] }]} />;
}

type MonthCell = { date: Date; inMonth: boolean };

function buildMonthGrid(year: number, month: number): MonthCell[] {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingCount = (firstDay.getDay() + 6) % 7;
  const cells: MonthCell[] = [];
  for (let d = leadingCount; d > 0; d--) cells.push({ date: new Date(year, month, 1 - d), inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d), inMonth: true });
  let trailing = 1;
  while (cells.length % 7 !== 0) cells.push({ date: new Date(year, month + 1, trailing++), inMonth: false });
  return cells;
}

export function LoggerTab() {
  const { user } = useAuth();
  const keyboardHeight = useKeyboardHeight();
  const { routines } = useRoutines(user?.uid);
  const {
    routineExecutions, setStatus, reschedule, remove: removeRoutineExec,
    addExerciseToExecution, removeExerciseFromExecution, replaceExerciseInExecution,
  } = useRoutineExecutions(user?.uid);
  const { exercises, update: updateExercise } = useExercises(user?.uid);
  const { executions, add, update, remove: removeExecExecution } = useExerciseExecutions(user?.uid);

  // Write 'completed' to Firestore when every exercise in a routine execution has
  // been logged, even if the reconciler previously marked it 'failed'.
  useEffect(() => {
    for (const exec of routineExecutions) {
      if (exec.status === 'completed' || exec.rescheduledTo || exec.deleted) continue;
      const r = routines.find((x) => x.id === exec.routineId);
      const exerciseIds = effectiveExerciseIds(r, exec);
      if (exerciseIds.length === 0) continue;
      const allDone = exerciseIds.every((eid) =>
        executions.some((e) => e.routineExecutionId === exec.id && e.exerciseId === eid && e.completed),
      );
      if (allDone) setStatus(exec.id, 'completed').catch(() => {});
    }
  }, [routineExecutions, executions, routines, setStatus]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Mon
    return d;
  });
  const [weekView, setWeekView] = useState(true);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [menuExec, setMenuExec] = useState<RoutineExecution | null>(null);
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  const dotsRefs = useRef<Map<string, View>>(new Map());
  // Keyed by `${routineExecutionId}:${exerciseId}` — reported live by ExerciseInlineForm
  // instances (which stay mounted even while collapsed) so a running cardio timer keeps
  // ticking, and its badge can still be shown on the collapsed routine header.
  const [runningTimers, setRunningTimers] = useState<Record<string, { elapsedSec: number; targetSec: number }>>({});
  const [reschedulingExec, setReschedulingExec] = useState<RoutineExecution | null>(null);
  const [pickerExec, setPickerExec] = useState<RoutineExecution | null>(null);
  const [pickerMode, setPickerMode] = useState<'add' | 'replace' | null>(null);
  const [replacingExId, setReplacingExId] = useState<string | null>(null);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }
  function prevWeek() {
    setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  }
  function nextWeek() {
    setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  }
  function weekDays(): Date[] {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }

  // Derives "fully done" from the actual logged data rather than trusting the stored
  // `completed` flag, which can be stale for executions saved before skipped sets were
  // excluded from completion (a skipped set must never count as done).
  function isExerciseFullyDone(execId: string, eid: string): boolean {
    const e = executions.find((x) => x.routineExecutionId === execId && x.exerciseId === eid);
    if (!e) return false;
    const ex = exercises.find((x) => x.id === eid);
    const isCardio = ex ? exerciseType(ex) === 'cardio' : false;
    if (isCardio) return Boolean(e.completed) && !e.skipped && !e.timerStartedAt;
    const count = ex?.sets ?? 3;
    if (!e.setData || e.setData.length < count) return false;
    return e.setData.every((s) => !s.skipped && s.weight != null && s.reps != null);
  }

  // A cardio timer ticking locally (reported via onTimerChange) is live progress even
  // before it's persisted to Firestore — checking it directly keeps the status badge,
  // timer badge, and progress bar all in sync instead of the badge alone updating first.
  function isExerciseRunningLive(execId: string, eid: string): boolean {
    return `${execId}:${eid}` in runningTimers;
  }

  // In progress: not skipped, not fully done, but has some data logged —
  // cardio: some elapsed duration saved (or a timer currently ticking locally);
  // strength: the first set's weight value is filled.
  function isExerciseInProgress(execId: string, eid: string): boolean {
    if (isExerciseRunningLive(execId, eid)) return true;
    const e = executions.find((x) => x.routineExecutionId === execId && x.exerciseId === eid);
    if (!e) return false;
    const ex = exercises.find((x) => x.id === eid);
    const isCardio = ex ? exerciseType(ex) === 'cardio' : false;
    if (isCardio) {
      if (e.skipped || isExerciseFullyDone(execId, eid)) return false;
      return Boolean(e.timerStartedAt) || (e.durationMin ?? 0) > 0;
    }
    if (!e.setData || e.setData.length === 0) return false;
    if (e.setData.some((s) => s.skipped)) return false;
    if (isExerciseFullyDone(execId, eid)) return false;
    return e.setData[0]?.weight != null;
  }

  function progressFor(exec: RoutineExecution): {
    anyLogged: number;
    reqDone: number; reqTotal: number; reqSetsDone: number; reqSetsTotal: number;
    reqSkipped: number; reqInProgress: number; reqSetsSkipped: number; reqSetsInProgress: number;
    optDone: number; optTotal: number; optSetsDone: number; optSetsTotal: number;
    optSkipped: number; optInProgress: number; optSetsSkipped: number; optSetsInProgress: number;
  } {
    const r = routines.find((x) => x.id === exec.routineId);
    const loggedIds = executions
      .filter((e) => e.routineExecutionId === exec.id)
      .map((e) => e.exerciseId);
    // Union: keep logged exercises even if removed from the routine
    const exerciseIds = [...new Set([...effectiveExerciseIds(r, exec), ...loggedIds])];
    const isDone = (eid: string) => isExerciseFullyDone(exec.id, eid);
    const anyLogged = exerciseIds.filter((eid) =>
      isExerciseRunningLive(exec.id, eid) ||
      executions.some((e) =>
        e.routineExecutionId === exec.id && e.exerciseId === eid &&
        (e.completed || e.setData?.some((s) => s.reps != null && s.weight != null)),
      ),
    ).length;

    let reqDone = 0, reqTotal = 0, reqSetsDone = 0, reqSetsTotal = 0, reqSkipped = 0, reqInProgress = 0;
    let reqSetsSkipped = 0, reqSetsInProgress = 0;
    let optDone = 0, optTotal = 0, optSetsDone = 0, optSetsTotal = 0, optSkipped = 0, optInProgress = 0;
    let optSetsSkipped = 0, optSetsInProgress = 0;

    for (const eid of exerciseIds) {
      const ex = exercises.find((e) => e.id === eid);
      const isCardio = ex ? exerciseType(ex) === 'cardio' : false;
      const count = isCardio ? 1 : (ex?.sets ?? 3);
      const exExec = executions.find((e) => e.routineExecutionId === exec.id && e.exerciseId === eid);
      const isSkipped = isCardio
        ? Boolean(exExec?.skipped)
        : Boolean(exExec?.setData?.some((s) => s.skipped));
      const isInProgress = isExerciseInProgress(exec.id, eid);

      let setsDone = 0, setsSkipped = 0, setsInProgress = 0;
      if (isCardio) {
        if (exExec?.completed) setsDone = 1;
        else if (isSkipped) setsSkipped = 1;
        else if (isInProgress) setsInProgress = 1;
      } else if (exExec?.setData) {
        setsDone = exExec.setData.filter((s) => s.reps != null && s.weight != null).length;
        setsSkipped = exExec.setData.filter((s) => s.skipped).length;
        // Once the exercise as a whole is in progress, every remaining set (whether
        // partially filled or not yet touched at all) counts toward "in progress" —
        // not just sets with some data already typed in.
        setsInProgress = isInProgress ? Math.max(0, count - setsDone - setsSkipped) : 0;
      } else if (exExec?.completed) {
        setsDone = count;
      }

      const isOptional = exerciseRole(r, eid) === 'optional';
      if (isOptional) {
        optTotal += 1;
        optSetsTotal += count;
        optSetsDone += setsDone;
        optSetsSkipped += setsSkipped;
        optSetsInProgress += setsInProgress;
        if (isDone(eid)) optDone += 1;
        if (isSkipped) optSkipped += 1;
        if (isInProgress) optInProgress += 1;
      } else {
        reqTotal += 1;
        reqSetsTotal += count;
        reqSetsDone += setsDone;
        reqSetsSkipped += setsSkipped;
        reqSetsInProgress += setsInProgress;
        if (isDone(eid)) reqDone += 1;
        if (isSkipped) reqSkipped += 1;
        if (isInProgress) reqInProgress += 1;
      }
    }

    return {
      anyLogged, reqDone, reqTotal, reqSetsDone, reqSetsTotal, reqSkipped, reqInProgress,
      reqSetsSkipped, reqSetsInProgress,
      optDone, optTotal, optSetsDone, optSetsTotal, optSkipped, optInProgress,
      optSetsSkipped, optSetsInProgress,
    };
  }

  function getDisplayStatus(exec: RoutineExecution): DisplayStatus {
    const routine = routines.find((r) => r.id === exec.routineId);
    const loggedIds = executions.filter((e) => e.routineExecutionId === exec.id).map((e) => e.exerciseId);
    const allIds = [...new Set([...effectiveExerciseIds(routine, exec), ...loggedIds])];
    const total = allIds.length;

    const isFullyLogged = (eid: string) => isExerciseFullyDone(exec.id, eid);

    const mandatoryIds = allIds.filter((eid) => exerciseRole(routine, eid) !== 'optional');
    const allMandatoryDone = total > 0 && mandatoryIds.length > 0 && mandatoryIds.every(isFullyLogged);
    if (allMandatoryDone) return 'completed';

    const anyLogged = allIds.some((eid) =>
      isExerciseRunningLive(exec.id, eid) ||
      executions.some((e) => e.routineExecutionId === exec.id && e.exerciseId === eid &&
        (e.completed || e.setData?.some((s) => s.reps != null && s.weight != null) ||
          Boolean(e.timerStartedAt) || (e.durationMin != null && e.durationMin > 0))));

    const delta = diffDays(todayISO(), exec.dueDate); // >0 once past due date

    if (delta < 0) return anyLogged ? 'in-progress' : 'pending'; // scheduled for a future date
    if (delta === 0) return anyLogged ? 'in-progress' : 'pending';
    // Past due date: still show in-progress while any exercise — mandatory or optional
    // — is actively being worked on, even though the execution has otherwise failed/incomplete.
    const anyInProgress = allIds.some((eid) => isExerciseInProgress(exec.id, eid));
    if (anyInProgress) return 'in-progress';
    return anyLogged ? 'incomplete' : 'failed'; // past due date — fails immediately, no grace window
  }

  function isRoutineExpanded(execId: string): boolean {
    return openIds.has(execId);
  }

  function toggleRoutine(execId: string) {
    setOpenIds((prev) => { const n = new Set(prev); n.has(execId) ? n.delete(execId) : n.add(execId); return n; });
  }

  function handleReset(exec: RoutineExecution) {
    Alert.alert('Reset execution?', 'All logged data for this routine will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => {
        const toRemove = executions.filter((e) => e.routineExecutionId === exec.id);
        await Promise.all(toRemove.map((e) => removeExecExecution(e.id)));
      }},
    ]);
  }

  function handleDelete(exec: RoutineExecution) {
    Alert.alert('Delete execution?', 'This routine execution and all its data will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeRoutineExec(exec.id) },
    ]);
  }

  const dotsByDate = useMemo(() => {
    const priority: Record<DisplayStatus, number> = {
      pending: 6, 'in-progress': 5, incomplete: 4, failed: 3, completed: 2,
    };
    const map = new Map<string, DisplayStatus[]>();
    for (const ex of routineExecutions.filter((e) => !e.rescheduledTo && !e.deleted)) {
      const dotStatus = getDisplayStatus(ex);
      const list = map.get(ex.dueDate);
      if (list) list.push(dotStatus);
      else map.set(ex.dueDate, [dotStatus]);
    }
    for (const list of map.values()) list.sort((a, b) => priority[b] - priority[a]);
    return map;
  }, [routineExecutions, routines, executions]);

  const cells = buildMonthGrid(viewYear, viewMonth);
  const weeks: MonthCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const routineName = (rid: string) => routines.find((r) => r.id === rid)?.name ?? 'Deleted Routine';

  const weekEndISO = toISO(new Date(weekStart.getTime() + 6 * 86400000));
  const weekStartISO = toISO(weekStart);

  const monthRangeStartISO = toISO(cells[0].date);
  const monthRangeEndISO = toISO(cells[cells.length - 1].date);

  const dueRoutines = routineExecutions
    .filter((e) => !e.rescheduledTo && !e.deleted && (weekView
      ? e.dueDate >= weekStartISO && e.dueDate <= weekEndISO
      : e.dueDate >= monthRangeStartISO && e.dueDate <= monthRangeEndISO))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));

  // Group by day, preserving newest-to-oldest order
  const weekGroups: { key: string; label: string; items: RoutineExecution[] }[] = [];
  for (const exec of dueRoutines) {
    const key = exec.dueDate;
    let g = weekGroups.find((x) => x.key === key);
    if (!g) { g = { key, label: dayGroupLabel(exec.dueDate), items: [] }; weekGroups.push(g); }
    g.items.push(exec);
  }

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + keyboardHeight }]}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid
      enableResetScrollToCoords={false}
      extraScrollHeight={100}
      extraHeight={150}
      keyboardOpeningTime={0}
    >
      <View style={styles.calendarCard}>
        {/* Nav header */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={weekView ? prevWeek : prevMonth} style={styles.navBtn} activeOpacity={0.7}>
            <MaterialIcons name="chevron-left" size={24} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setWeekView((v) => !v)} activeOpacity={0.8} style={styles.navLabelBtn}>
            <Text style={styles.monthLabel}>
              {weekView
                ? `${DAY_LABELS[(weekStart.getDay() + 6) % 7]} ${weekStart.getDate()} – ${DAY_LABELS[(new Date(weekStart.getTime() + 6 * 86400000).getDay() + 6) % 7]} ${new Date(weekStart.getTime() + 6 * 86400000).getDate()} ${MONTH_NAMES[new Date(weekStart.getTime() + 6 * 86400000).getMonth()]}`
                : `${MONTH_NAMES[viewMonth]} ${viewYear}`}
            </Text>
            <MaterialIcons name={weekView ? 'calendar-view-month' : 'calendar-view-week'} size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
          <TouchableOpacity onPress={weekView ? nextWeek : nextMonth} style={styles.navBtn} activeOpacity={0.7}>
            <MaterialIcons name="chevron-right" size={24} color={colors.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          {DAY_LABELS.map((d) => <Text key={d} style={styles.dayHeader}>{d}</Text>)}
        </View>

        {weekView ? (
          <View style={styles.weekRow}>
            {weekDays().map((date, di) => {
              const isToday = isSameDay(date, today);
              const isWeekend = di >= 5;
              const dots = dotsByDate.get(toISO(date)) ?? [];
              return (
                <View key={di} style={[styles.dayCell, isToday && styles.dayCellToday]}>
                  <Text style={[styles.dayNumber, isWeekend && styles.dayNumberWeekend, isToday && styles.dayNumberToday]}>
                    {date.getDate()}
                  </Text>
                  <View style={styles.dotRow}>
                    {dots.length > 0
                      ? dots.map((s, i) => renderDot(s, i))
                      : <View style={[styles.dot, styles.dotHidden]} />}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          weeks.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map(({ date, inMonth }, di) => {
                const isToday = isSameDay(date, today);
                const isWeekend = di >= 5;
                const dots = dotsByDate.get(toISO(date)) ?? [];
                return (
                  <View key={di} style={[styles.dayCell, isToday && styles.dayCellToday]}>
                    <Text style={[
                      styles.dayNumber,
                      isWeekend && styles.dayNumberWeekend,
                      isToday && styles.dayNumberToday,
                      !inMonth && styles.dayNumberOutOfMonth,
                    ]}>
                      {date.getDate()}
                    </Text>
                    <View style={styles.dotRow}>
                      {dots.length > 0
                        ? dots.map((s, i) => renderDot(s, i))
                        : <View style={[styles.dot, styles.dotHidden]} />}
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </View>

      {dueRoutines.length === 0 ? (
        <Text style={styles.agendaEmpty}>Nothing scheduled for this period.</Text>
      ) : null}

      {weekGroups.map((wg) => (
        <View key={wg.key}>
          <Text style={styles.weekHeader}>{wg.label}</Text>

          {wg.items.map((exec) => {
            const {
              reqSetsDone, reqSetsTotal, reqSetsSkipped, reqSetsInProgress,
              optSetsDone, optSetsTotal, optSetsSkipped, optSetsInProgress,
            } = progressFor(exec);
            const status = getDisplayStatus(exec);
            const color = STATUS_COLOR[status];
            const runningKey = Object.keys(runningTimers).find((k) => k.startsWith(`${exec.id}:`));
            const running = runningKey != null ? runningTimers[runningKey] : null;
            // The progress bar always shows completed-exercises in green, regardless of
            // overall status color (e.g. "in-progress" is orange but that's a badge color,
            // not a progress-bar color).
            const barColor = STATUS_COLOR.completed;
            const expanded = isRoutineExpanded(exec.id);
            // All percentages here are of sets, not exercises — a routine with one 1-set
            // and one 5-set exercise shouldn't weigh them equally.
            // Skipped optional sets are excluded entirely (not just from the numerator,
            // but from the denominator too) — they shouldn't drag down or otherwise affect
            // the percentage/bar at all, unlike skipped mandatory sets which still count.
            const allSetsTotal = reqSetsTotal + optSetsTotal - optSetsSkipped;
            const allSetsDoneCount = reqSetsDone + optSetsDone;
            const allSetsInProgress = reqSetsInProgress + optSetsInProgress;
            const allSetsSkipped = reqSetsSkipped;
            const reqSetsPct = allSetsTotal > 0 ? (allSetsDoneCount / allSetsTotal) * 100 : 0;
            const reqInProgressPct = allSetsTotal > 0 ? (allSetsInProgress / allSetsTotal) * 100 : 0;
            const reqSkippedPct = allSetsTotal > 0 ? (allSetsSkipped / allSetsTotal) * 100 : 0;
            const routine = routines.find((r) => r.id === exec.routineId);

            const statusLabel =
              status === 'pending' ? 'Pending' :
              status === 'in-progress' ? 'In Progress' :
              status === 'incomplete' ? 'Incomplete' :
              status === 'completed' ? 'Completed' : 'Failed';

            const loggedIds = executions
              .filter((e) => e.routineExecutionId === exec.id)
              .map((e) => e.exerciseId);
            const exerciseIds = [...new Set([...effectiveExerciseIds(routine, exec), ...loggedIds])];
            const routineExercises = exerciseIds
              .map((eid) => exercises.find((e) => e.id === eid))
              .filter((e): e is Exercise => Boolean(e));

            const ROLE_ORDER = ['warmup', 'mandatory', 'optional'] as const;
            const ROLE_LABEL: Record<typeof ROLE_ORDER[number], string> = {
              warmup: 'Warm-up', mandatory: 'Mandatory', optional: 'Optional',
            };
            // Ad-hoc exercises added to just this occurrence are always optional,
            // regardless of what the routine template would otherwise default to.
            const roleFor = (exId: string) =>
              exec.addedExerciseIds?.includes(exId) ? 'optional' : exerciseRole(routine, exId);
            const grouped = routineExercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
              const g = roleFor(ex.id);
              if (!acc[g]) acc[g] = [];
              acc[g].push(ex);
              return acc;
            }, {});
            for (const g of Object.keys(grouped)) {
              grouped[g].sort((a, b) =>
                exerciseBadge(a).localeCompare(exerciseBadge(b)) || a.name.localeCompare(b.name));
            }
            const groupNames = ROLE_ORDER.filter((r) => grouped[r]?.length);

            return (
              <View
                key={exec.id}
                style={[styles.agendaCard, { marginBottom: spacing.sm }]}
              >
                <Pressable style={styles.cardHeader} onPress={() => toggleRoutine(exec.id)}>
                  <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color={colors.textMuted} />
                  <View style={styles.titleCol}>
                    <View style={styles.titleRow}>
                      <Text style={styles.agendaName}>{routineName(exec.routineId)}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: `${color}22` }]}>
                        <Text style={[styles.statusBadgeText, { color }]}>{statusLabel}</Text>
                      </View>
                      {optSetsDone > 0 && (
                        <View style={[styles.statusBadge, { backgroundColor: `${PERFECT_COLOR}22` }]}>
                          <Text style={[styles.statusBadgeText, { color: PERFECT_COLOR }]}>⭐</Text>
                        </View>
                      )}
                      {running != null && (
                        running.elapsedSec >= running.targetSec ? (
                          <>
                            <View style={[styles.statusBadge, { backgroundColor: '#22C55E22' }]}>
                              <Text style={[styles.statusBadgeText, { color: '#22C55E' }]}>
                                {pad2(Math.floor(running.targetSec / 60))}:{pad2(running.targetSec % 60)}
                              </Text>
                            </View>
                            <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLOR['in-progress']}22` }]}>
                              <Text style={[styles.statusBadgeText, { color: STATUS_COLOR['in-progress'] }]}>
                                + {pad2(Math.floor((running.elapsedSec - running.targetSec) / 60))}:{pad2((running.elapsedSec - running.targetSec) % 60)}
                              </Text>
                            </View>
                          </>
                        ) : (
                          <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLOR['in-progress']}22` }]}>
                            <Text style={[styles.statusBadgeText, { color: STATUS_COLOR['in-progress'] }]}>
                              {pad2(Math.floor(running.elapsedSec / 60))}:{pad2(running.elapsedSec % 60)}
                            </Text>
                          </View>
                        )
                      )}
                    </View>
                    <Text style={styles.progressLabel}>
                      {new Date(exec.dueDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                      {Math.round(reqSetsPct) > 0 && (
                        <>{' · '}<Text style={{ color: barColor }}>{Math.round(reqSetsPct)}%</Text></>
                      )}
                      {Math.round(reqInProgressPct) > 0 && (
                        <>{' · '}<Text style={{ color: STATUS_COLOR['in-progress'] }}>{Math.round(reqInProgressPct)}%</Text></>
                      )}
                      {Math.round(reqSkippedPct) > 0 && (
                        <>{' · '}<Text style={{ color: colors.danger }}>{Math.round(reqSkippedPct)}%</Text></>
                      )}
                    </Text>
                  </View>
                  <Pressable
                    ref={(el) => { if (el) dotsRefs.current.set(exec.id, el as unknown as View); }}
                    hitSlop={8}
                    onPress={(e) => {
                      e.stopPropagation();
                      dotsRefs.current.get(exec.id)?.measureInWindow((x, y, width, height) => {
                        setMenuAnchor({ x: x + width / 2, y: y + height / 2 });
                        setMenuExec(exec);
                      });
                    }}
                  >
                    <MaterialIcons name="more-vert" size={22} color={colors.textMuted} />
                  </Pressable>
                </Pressable>

                <View style={styles.progressStack}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, styles.progressFillOverlay, { width: `${reqSetsPct}%`, backgroundColor: barColor }]} />
                    {reqInProgressPct > 0 && (
                      <View style={[styles.progressFill, styles.progressFillOverlay, { left: `${reqSetsPct}%`, width: `${reqInProgressPct}%`, backgroundColor: STATUS_COLOR['in-progress'] }]} />
                    )}
                    {reqSkippedPct > 0 && (
                      <View style={[styles.progressFill, styles.progressFillOverlay, { left: `${reqSetsPct + reqInProgressPct}%`, width: `${reqSkippedPct}%`, backgroundColor: colors.danger }]} />
                    )}
                  </View>
                </View>

                {routineExercises.length > 0 && (
                  <View style={[styles.exerciseList, !expanded && styles.exerciseListHidden]}>
                    {groupNames.map((group) => (
                      <View key={group}>
                        <Text style={styles.groupLabel}>{ROLE_LABEL[group]}</Text>
                        {grouped[group].map((ex) => {
                          const exExec = executions.find(
                            (e) => e.routineExecutionId === exec.id && e.exerciseId === ex.id,
                          ) ?? null;
                          const lastExec = executions
                            .filter((e) => e.exerciseId === ex.id && e.id !== exExec?.id &&
                              (e.weight != null || e.setData?.some((s) => s.weight != null) ||
                                e.durationMin != null || (e.paramValues && e.paramValues.length > 0)))
                            .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
                          return (
                            <ExerciseInlineForm
                              key={ex.id}
                              exercise={ex}
                              badge={exerciseBadge(ex)}
                              execution={exExec}
                              lastExecution={lastExec}
                              routineExecutionId={exec.id}
                              dueDate={exec.dueDate}
                              canDelete={roleFor(ex.id) === 'optional'}
                              onUpdateExercise={(data) => updateExercise(ex.id, data)}
                              onReplace={() => { setPickerExec(exec); setReplacingExId(ex.id); setPickerMode('replace'); }}
                              onTimerChange={(running, elapsedSec) => {
                                const key = `${exec.id}:${ex.id}`;
                                const targetSec = Math.round((ex.durationMin ?? 10) * 60);
                                setRunningTimers((prev) => {
                                  if (running) {
                                    if (prev[key]?.elapsedSec === elapsedSec && prev[key]?.targetSec === targetSec) return prev;
                                    return { ...prev, [key]: { elapsedSec, targetSec } };
                                  }
                                  if (!(key in prev)) return prev;
                                  const next = { ...prev };
                                  delete next[key];
                                  return next;
                                });
                              }}
                              onSave={async (data, currentExecId) => {
                                if (data === null) {
                                  const idToDelete = currentExecId ?? executions.find(
                                    (e) => e.routineExecutionId === exec.id && e.exerciseId === ex.id,
                                  )?.id;
                                  if (idToDelete) await removeExecExecution(idToDelete);
                                  return null;
                                }
                                const live = executions.find(
                                  (e) => e.routineExecutionId === exec.id && e.exerciseId === ex.id,
                                );
                                if (live) { await update(live.id, data); return live.id; }
                                return await add(data);
                              }}
                            />
                          );
                        })}
                      </View>
                    ))}
                    <Pressable
                      style={styles.addExerciseRow}
                      onPress={() => { setPickerExec(exec); setReplacingExId(null); setPickerMode('add'); }}
                    >
                      <MaterialIcons name="add" size={16} color={colors.accent} />
                      <Text style={styles.addExerciseText}>Add optional exercise</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ))}

      {/* ── Context menu ─────────────────────────────────────────────── */}
      <RNModal visible={menuExec !== null} transparent animationType="none" onRequestClose={() => setMenuExec(null)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuExec(null)}>
          {/* Position card so the close row's X icon centre sits exactly where the dots icon was, regardless of tap position. */}
          <Pressable
            style={[
              styles.menuCard,
              { top: menuAnchor.y - MENU_CLOSE_HEIGHT / 2, left: menuAnchor.x - MENU_CARD_WIDTH + MENU_X_OFFSET_FROM_RIGHT },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Close row — no more than half the height of a menu item, X icon right-aligned to match the dots */}
            <Pressable style={styles.menuCloseRow} onPress={() => setMenuExec(null)}>
              <MaterialIcons name="close" size={14} color={colors.textMuted} />
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => { const e = menuExec; setMenuExec(null); setReschedulingExec(e); }}>
              <MaterialIcons name="event" size={18} color={RESCHEDULE_COLOR} />
              <Text style={[styles.menuItemText, { color: RESCHEDULE_COLOR }]}>Reschedule</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => { const e = menuExec!; setMenuExec(null); handleReset(e); }}>
              <MaterialIcons name="refresh" size={18} color={colors.text} />
              <Text style={styles.menuItemText}>Reset</Text>
            </Pressable>
            <Pressable style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => { const e = menuExec!; setMenuExec(null); handleDelete(e); }}>
              <MaterialIcons name="delete" size={18} color={colors.danger} />
              <Text style={[styles.menuItemText, { color: colors.danger }]}>Delete</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </RNModal>

      {/* ── Reschedule modal ─────────────────────────────────────────── */}
      <CalendarModal
        title="Reschedule to"
        visible={reschedulingExec !== null}
        value={reschedulingExec?.dueDate ?? todayISO()}
        onSelect={async (newDate) => {
          const exec = reschedulingExec;
          setReschedulingExec(null);
          if (exec && newDate !== exec.dueDate) await reschedule(exec, newDate);
        }}
        onClose={() => setReschedulingExec(null)}
      />

      {/* ── Add/replace exercise (this occurrence only) ─────────────────── */}
      <RNModal visible={pickerMode !== null} transparent animationType="fade" onRequestClose={() => setPickerMode(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPickerMode(null)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>{pickerMode === 'replace' ? 'Replace with' : 'Add exercise'}</Text>
            <ScrollView style={styles.pickerList}>
              {(() => {
                const routine = pickerExec ? routines.find((r) => r.id === pickerExec.routineId) : undefined;
                const currentIds = pickerExec ? effectiveExerciseIds(routine, pickerExec) : [];
                return exercises
                  .filter((e) => e.id !== replacingExId && !currentIds.includes(e.id))
                  .map((e) => (
                    <Pressable
                      key={e.id}
                      style={styles.pickerItem}
                      onPress={async () => {
                        if (!pickerExec) return;
                        if (pickerMode === 'replace' && replacingExId) {
                          await replaceExerciseInExecution(pickerExec, replacingExId, e.id);
                        } else {
                          await addExerciseToExecution(pickerExec, e.id);
                        }
                        setPickerMode(null);
                        setPickerExec(null);
                        setReplacingExId(null);
                      }}
                    >
                      <Text style={styles.pickerItemText}>{e.name}</Text>
                    </Pressable>
                  ));
              })()}
            </ScrollView>
            {pickerMode === 'replace' && replacingExId && (
              <Pressable
                style={styles.pickerRemoveBtn}
                onPress={async () => {
                  if (!pickerExec || !replacingExId) return;
                  await removeExerciseFromExecution(pickerExec, replacingExId);
                  setPickerMode(null);
                  setPickerExec(null);
                  setReplacingExId(null);
                }}
              >
                <Text style={styles.pickerRemoveText}>Remove instead (no replacement)</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </RNModal>

    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navBtn: { padding: spacing.xs },
  navLabelBtn: { flexDirection: 'row', alignItems: 'center' },
  monthLabel: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  weekRow: { flexDirection: 'row' },
  dayHeader: {
    flex: 1, textAlign: 'center', color: colors.textMuted,
    fontSize: font.sm, fontWeight: '500', paddingVertical: spacing.sm,
  },
  dayCell: { flex: 1, alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs, height: 48 },
  dayCellToday: { backgroundColor: `${colors.accent}18` },
  dayNumber: { color: colors.text, fontSize: font.md },
  dayNumberWeekend: { color: colors.textMuted },
  dayNumberToday: { color: colors.accent, fontWeight: '700' },
  dayNumberOutOfMonth: { opacity: 0.35 },
  dotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
    maxWidth: '100%',
  },
  dot: { width: 5, height: 5, borderRadius: 999 },
  dotHidden: { backgroundColor: 'transparent' },
  agendaEmpty: { color: colors.textDim, fontSize: font.md, paddingVertical: spacing.md },
  weekHeader: {
    color: colors.textMuted,
    fontSize: font.sm,
    fontWeight: '600',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.sm,
  },
  agendaCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  menuBackdrop: {
    flex: 1,
  },
  menuCard: {
    position: 'absolute',
    width: MENU_CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  menuCloseRow: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemText: { color: colors.text, fontSize: font.sm },
  titleCol: { flex: 1, gap: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  agendaName: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  progressLabel: { color: colors.textMuted, fontSize: font.sm },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusBadgeText: { fontSize: 11, lineHeight: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  progressStack: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.surface2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 4 },
  progressFillOverlay: { position: 'absolute', top: 0, left: 0 },
  exerciseList: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  exerciseListHidden: {
    display: 'none',
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  addExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addExerciseText: { color: colors.accent, fontSize: font.sm },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    maxHeight: '70%',
    gap: spacing.md,
  },
  pickerTitle: { color: colors.text, fontSize: font.lg, fontWeight: '600' },
  pickerList: { flexGrow: 0 },
  pickerItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface2,
  },
  pickerItemText: { color: colors.text, fontSize: font.md },
  pickerRemoveBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  pickerRemoveText: { color: colors.danger, fontSize: font.sm },
});
