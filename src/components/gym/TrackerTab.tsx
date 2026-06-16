import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  useRoutines, useRoutineExecutions, useExercises, useExerciseExecutions,
} from '../../store/gymStore';
import { toISO } from '../../lib/schedule';
import { exerciseType } from '../../types/gym';
import { colors, font, spacing, radius } from '../../theme';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingEmpties = (firstDay.getDay() + 6) % 7;
  const cells: (Date | null)[] = Array(leadingEmpties).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const STATUS_COLOR = { pending: colors.accent, completed: '#22C55E', failed: colors.danger } as const;

export function TrackerTab() {
  const { user } = useAuth();
  const router = useRouter();
  const { routines } = useRoutines(user?.uid);
  const { routineExecutions } = useRoutineExecutions(user?.uid);
  const { exercises } = useExercises(user?.uid);
  const { executions } = useExerciseExecutions(user?.uid);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(today);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  // Map ISO date -> aggregate status for the calendar dot.
  const dotByDate = useMemo(() => {
    const map = new Map<string, keyof typeof STATUS_COLOR>();
    for (const ex of routineExecutions) {
      const prev = map.get(ex.dueDate);
      // priority: pending > failed > completed
      if (ex.status === 'pending') map.set(ex.dueDate, 'pending');
      else if (ex.status === 'failed' && prev !== 'pending') map.set(ex.dueDate, 'failed');
      else if (!prev) map.set(ex.dueDate, 'completed');
    }
    return map;
  }, [routineExecutions]);

  const cells = buildMonthGrid(viewYear, viewMonth);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const selectedISO = toISO(selectedDate);
  const routineName = (rid: string) => routines.find((r) => r.id === rid)?.name ?? 'Routine';
  const exerciseName = (eid: string) => exercises.find((e) => e.id === eid)?.name ?? 'Exercise';

  const dueRoutines = routineExecutions
    .filter((e) => e.dueDate === selectedISO)
    .sort((a, b) => routineName(a.routineId).localeCompare(routineName(b.routineId)));

  const loggedExercises = executions
    .filter((e) => e.date === selectedISO)
    .sort((a, b) => exerciseName(a.exerciseId).localeCompare(exerciseName(b.exerciseId)));

  function progressFor(execId: string, routineId: string): { done: number; total: number } {
    const r = routines.find((x) => x.id === routineId);
    const total = r?.exerciseIds.length ?? 0;
    const done = (r?.exerciseIds ?? []).filter((eid) =>
      executions.some((e) => e.routineExecutionId === execId && e.exerciseId === eid && e.completed),
    ).length;
    return { done, total };
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.calendarCard}>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7}>
            <MaterialIcons name="chevron-left" size={24} color={colors.accent} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7}>
            <MaterialIcons name="chevron-right" size={24} color={colors.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          {DAY_LABELS.map((d) => <Text key={d} style={styles.dayHeader}>{d}</Text>)}
        </View>

        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((date, di) => {
              if (!date) return <View key={di} style={styles.dayCell} />;
              const isToday = isSameDay(date, today);
              const isSelected = isSameDay(date, selectedDate);
              const isWeekend = di >= 5;
              const dot = dotByDate.get(toISO(date));
              return (
                <TouchableOpacity
                  key={di}
                  style={[styles.dayCell, isSelected && styles.dayCellSelected, isToday && !isSelected && styles.dayCellToday]}
                  onPress={() => setSelectedDate(date)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.dayNumber,
                    isWeekend && styles.dayNumberWeekend,
                    isToday && !isSelected && styles.dayNumberToday,
                    isSelected && styles.dayNumberSelected,
                  ]}>
                    {date.getDate()}
                  </Text>
                  <View style={[styles.dot, dot ? { backgroundColor: isSelected ? '#fff' : STATUS_COLOR[dot] } : styles.dotHidden]} />
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Agenda for the selected day */}
      <Text style={styles.agendaTitle}>
        {selectedDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      </Text>

      {dueRoutines.length === 0 && loggedExercises.length === 0 ? (
        <Text style={styles.agendaEmpty}>Nothing scheduled or logged for this day.</Text>
      ) : null}

      {dueRoutines.map((exec) => {
        const { done, total } = progressFor(exec.id, exec.routineId);
        return (
          <Pressable
            key={exec.id}
            style={styles.agendaCard}
            onPress={() => router.push(`/fitness/routine-execution/${exec.id}`)}
          >
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[exec.status] }]} />
            <View style={styles.agendaMain}>
              <Text style={styles.agendaName}>{routineName(exec.routineId)}</Text>
              <Text style={[styles.agendaStatus, { color: STATUS_COLOR[exec.status] }]}>
                {exec.status === 'pending' ? 'Pending' : exec.status === 'completed' ? 'Completed' : 'Failed'}
                {total > 0 ? `  ·  ${done}/${total} done` : ''}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
          </Pressable>
        );
      })}

      {loggedExercises.map((exec) => {
        const ex = exercises.find((e) => e.id === exec.exerciseId);
        const isCardio = ex ? exerciseType(ex) === 'cardio' : exec.durationMin != null;
        const sub = isCardio
          ? (exec.durationMin != null ? `${exec.durationMin} min` : 'Logged')
          : exec.seriesData && exec.seriesData.length > 0
            ? `${exec.seriesData.filter((s) => s.reps != null && s.weight != null).length}/${exec.seriesData.length} series`
            : (exec.series || exec.reps ? `${exec.series ?? '?'} × ${exec.reps ?? '?'}` : 'Logged');
        return (
          <Pressable key={exec.id} style={styles.agendaCard} onPress={() => router.push(`/fitness/exercise/${exec.exerciseId}`)}>
            <View style={[styles.statusDot, { backgroundColor: exec.completed ? '#22C55E' : colors.textMuted }]} />
            <View style={styles.agendaMain}>
              <Text style={styles.agendaName}>{exerciseName(exec.exerciseId)}</Text>
              <Text style={styles.agendaSub}>{sub}{exec.completed ? '  ·  Completed' : ''}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
          </Pressable>
        );
      })}
    </ScrollView>
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
  monthLabel: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  weekRow: { flexDirection: 'row' },
  dayHeader: {
    flex: 1, textAlign: 'center', color: colors.textMuted,
    fontSize: font.sm, fontWeight: '500', paddingVertical: spacing.sm,
  },
  dayCell: { flex: 1, alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  dayCellToday: { backgroundColor: `${colors.accent}18` },
  dayCellSelected: { backgroundColor: colors.accent },
  dayNumber: { color: colors.text, fontSize: font.md },
  dayNumberWeekend: { color: colors.textMuted },
  dayNumberToday: { color: colors.accent, fontWeight: '700' },
  dayNumberSelected: { color: '#fff', fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 3 },
  dotHidden: { backgroundColor: 'transparent' },
  agendaTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700', marginTop: spacing.sm },
  agendaEmpty: { color: colors.textDim, fontSize: font.md, paddingVertical: spacing.md },
  agendaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.md,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  agendaMain: { flex: 1 },
  agendaName: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  agendaStatus: { fontSize: font.sm, marginTop: 2, fontWeight: '600' },
  agendaSub: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  completeBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '600' },
  expired: { color: colors.danger, fontSize: font.sm },
  undo: { color: colors.accent, fontSize: font.sm },
});
