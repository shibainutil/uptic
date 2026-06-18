import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet, Alert, Modal as RNModal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  useRoutines, useRoutineExecutions, useExercises, useExerciseExecutions,
} from '../../store/gymStore';
import { toISO, todayISO } from '../../lib/schedule';
import { type Exercise, type RoutineExecution, exerciseMuscleGroup } from '../../types/gym';
import { colors, font, spacing, radius } from '../../theme';
import { ExerciseInlineForm } from './ExerciseInlineForm';
import { DatePicker } from '../ui/DatePicker';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_COLOR = {
  pending: colors.accent,
  'in-progress': '#F59E0B',
  completed: '#22C55E',
  failed: colors.danger,
} as const;

type DisplayStatus = keyof typeof STATUS_COLOR;

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function weekGroupKey(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getFullYear()}-W${String(getISOWeek(d)).padStart(2, '0')}`;
}

function weekGroupLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const offset = (d.getDay() + 6) % 7;
  const mon = new Date(d); mon.setDate(d.getDate() - offset);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(mon)} – ${fmt(sun)}  [W${getISOWeek(d)}]`;
}

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

export function LoggerTab() {
  const { user } = useAuth();
  const { routines } = useRoutines(user?.uid);
  const { routineExecutions, reschedule, remove: removeRoutineExec } = useRoutineExecutions(user?.uid);
  const { exercises } = useExercises(user?.uid);
  const { executions, add, update, remove: removeExecExecution } = useExerciseExecutions(user?.uid);

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
  const [closedIds, setClosedIds] = useState<Set<string>>(new Set());
  const [menuExec, setMenuExec] = useState<RoutineExecution | null>(null);
  const [menuY, setMenuY] = useState(0);
  const [reschedulingExec, setReschedulingExec] = useState<RoutineExecution | null>(null);

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

  function progressFor(execId: string, routineId: string): {
    done: number; total: number; anyLogged: number;
    seriesDone: number; seriesTotal: number;
  } {
    const r = routines.find((x) => x.id === routineId);
    const loggedIds = executions
      .filter((e) => e.routineExecutionId === execId)
      .map((e) => e.exerciseId);
    // Union: keep logged exercises even if removed from the routine
    const exerciseIds = [...new Set([...(r?.exerciseIds ?? []), ...loggedIds])];
    const total = exerciseIds.length;
    const done = exerciseIds.filter((eid) =>
      executions.some((e) => e.routineExecutionId === execId && e.exerciseId === eid && e.completed),
    ).length;
    const anyLogged = exerciseIds.filter((eid) =>
      executions.some((e) =>
        e.routineExecutionId === execId && e.exerciseId === eid &&
        (e.completed || e.seriesData?.some((s) => s.reps != null && s.weight != null)),
      ),
    ).length;
    let seriesDone = 0;
    let seriesTotal = 0;
    for (const eid of exerciseIds) {
      const ex = exercises.find((e) => e.id === eid);
      const count = ex?.series ?? 3;
      seriesTotal += count;
      const exExec = executions.find((e) => e.routineExecutionId === execId && e.exerciseId === eid);
      if (exExec?.seriesData) {
        seriesDone += exExec.seriesData.filter((s) => s.reps != null && s.weight != null).length;
      } else if (exExec?.completed) {
        seriesDone += count;
      }
    }
    return { done, total, anyLogged, seriesDone, seriesTotal };
  }

  function getDisplayStatus(exec: { id: string; routineId: string; status: string }): DisplayStatus {
    if (exec.status === 'failed') return 'failed';
    if (exec.status === 'completed') return 'completed';
    const { done, total, anyLogged } = progressFor(exec.id, exec.routineId);
    if (done === total && total > 0) return 'completed';
    if (anyLogged > 0) return 'in-progress';
    return 'pending';
  }

  function isRoutineExpanded(execId: string, status: DisplayStatus): boolean {
    if (status === 'in-progress' || status === 'completed') return !closedIds.has(execId);
    return openIds.has(execId);
  }

  function toggleRoutine(execId: string, status: DisplayStatus) {
    if (status === 'in-progress' || status === 'completed') {
      setClosedIds((prev) => { const n = new Set(prev); n.has(execId) ? n.delete(execId) : n.add(execId); return n; });
    } else {
      setOpenIds((prev) => { const n = new Set(prev); n.has(execId) ? n.delete(execId) : n.add(execId); return n; });
    }
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
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const toRemove = executions.filter((e) => e.routineExecutionId === exec.id);
        await Promise.all(toRemove.map((e) => removeExecExecution(e.id)));
        await removeRoutineExec(exec.id);
      }},
    ]);
  }

  const dotByDate = useMemo(() => {
    const map = new Map<string, 'pending' | 'completed' | 'failed'>();
    for (const ex of routineExecutions) {
      const prev = map.get(ex.dueDate);
      if (ex.status === 'pending') map.set(ex.dueDate, 'pending');
      else if (ex.status === 'failed' && prev !== 'pending') map.set(ex.dueDate, 'failed');
      else if (!prev) map.set(ex.dueDate, 'completed');
    }
    return map;
  }, [routineExecutions]);

  const cells = buildMonthGrid(viewYear, viewMonth);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const routineName = (rid: string) => routines.find((r) => r.id === rid)?.name ?? 'Deleted Routine';

  const weekEndISO = toISO(new Date(weekStart.getTime() + 6 * 86400000));
  const weekStartISO = toISO(weekStart);

  const dueRoutines = routineExecutions
    .filter((e) => weekView
      ? e.dueDate >= weekStartISO && e.dueDate <= weekEndISO
      : (() => { const d = new Date(e.dueDate); return d.getFullYear() === viewYear && d.getMonth() === viewMonth; })())
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));

  // Group by ISO week, preserving newest-to-oldest order
  const weekGroups: { key: string; label: string; items: RoutineExecution[] }[] = [];
  for (const exec of dueRoutines) {
    const key = weekGroupKey(exec.dueDate);
    let g = weekGroups.find((x) => x.key === key);
    if (!g) { g = { key, label: weekGroupLabel(exec.dueDate), items: [] }; weekGroups.push(g); }
    g.items.push(exec);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
              const dot = dotByDate.get(toISO(date));
              return (
                <View key={di} style={[styles.dayCell, isToday && styles.dayCellToday]}>
                  <Text style={[styles.dayNumber, isWeekend && styles.dayNumberWeekend, isToday && styles.dayNumberToday]}>
                    {date.getDate()}
                  </Text>
                  <View style={[styles.dot, dot ? { backgroundColor: STATUS_COLOR[dot] } : styles.dotHidden]} />
                </View>
              );
            })}
          </View>
        ) : (
          weeks.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((date, di) => {
                if (!date) return <View key={di} style={styles.dayCell} />;
                const isToday = isSameDay(date, today);
                const isWeekend = di >= 5;
                const dot = dotByDate.get(toISO(date));
                return (
                  <View key={di} style={[styles.dayCell, isToday && styles.dayCellToday]}>
                    <Text style={[styles.dayNumber, isWeekend && styles.dayNumberWeekend, isToday && styles.dayNumberToday]}>
                      {date.getDate()}
                    </Text>
                    <View style={[styles.dot, dot ? { backgroundColor: STATUS_COLOR[dot] } : styles.dotHidden]} />
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
            const { done, total, seriesDone, seriesTotal } = progressFor(exec.id, exec.routineId);
            const status = getDisplayStatus(exec);
            const color = STATUS_COLOR[status];
            const expanded = isRoutineExpanded(exec.id, status);
            const exPct = total > 0 ? (done / total) * 100 : 0;
            const seriesPct = seriesTotal > 0 ? (seriesDone / seriesTotal) * 100 : 0;
            const routine = routines.find((r) => r.id === exec.routineId);

            const statusLabel =
              status === 'pending' ? 'Pending' :
              status === 'in-progress' ? 'In Progress' :
              status === 'completed' ? 'Completed' : 'Failed';

            const loggedIds = executions
              .filter((e) => e.routineExecutionId === exec.id)
              .map((e) => e.exerciseId);
            const exerciseIds = [...new Set([...(routine?.exerciseIds ?? []), ...loggedIds])];
            const routineExercises = exerciseIds
              .map((eid) => exercises.find((e) => e.id === eid))
              .filter((e): e is Exercise => Boolean(e));

            const grouped = routineExercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
              const g = exerciseMuscleGroup(ex);
              if (!acc[g]) acc[g] = [];
              acc[g].push(ex);
              return acc;
            }, {});
            const groupNames = Object.keys(grouped).sort();

            return (
              <View key={exec.id} style={styles.agendaCard}>
                <Pressable style={styles.cardHeader} onPress={() => toggleRoutine(exec.id, status)}>
                  <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color={colors.textMuted} />
                  <View style={styles.titleCol}>
                    <View style={styles.titleRow}>
                      <Text style={styles.agendaName}>{routineName(exec.routineId)}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: `${color}22` }]}>
                        <Text style={[styles.statusBadgeText, { color }]}>{statusLabel}</Text>
                      </View>
                    </View>
                    <Text style={styles.progressLabel}>
                      {new Date(exec.dueDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {done}/{total} exercises · {seriesDone}/{seriesTotal} series
                    </Text>
                  </View>
                  <Pressable
                    hitSlop={8}
                    onPressIn={(e) => setMenuY(e.nativeEvent.pageY)}
                    onPress={(e) => { e.stopPropagation(); setMenuExec(exec); }}
                  >
                    <MaterialIcons name="more-vert" size={22} color={colors.textMuted} />
                  </Pressable>
                </Pressable>

                <View style={styles.progressStack}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${seriesPct}%`, backgroundColor: `${color}44` }]} />
                    <View style={[styles.progressFill, styles.progressFillOverlay, { width: `${exPct}%`, backgroundColor: color }]} />
                  </View>
                </View>

                {expanded && routineExercises.length > 0 && (
                  <View style={styles.exerciseList}>
                    {groupNames.map((group) => (
                      <View key={group}>
                        <Text style={styles.groupLabel}>{group}</Text>
                        {grouped[group].map((ex) => {
                          const exExec = executions.find(
                            (e) => e.routineExecutionId === exec.id && e.exerciseId === ex.id,
                          ) ?? null;
                          const lastExec = executions
                            .filter((e) => e.exerciseId === ex.id && e.id !== exExec?.id &&
                              (e.weight != null || e.seriesData?.some((s) => s.weight != null)))
                            .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
                          return (
                            <ExerciseInlineForm
                              key={ex.id}
                              exercise={ex}
                              execution={exExec}
                              lastExecution={lastExec}
                              routineExecutionId={exec.id}
                              dueDate={exec.dueDate}
                              onSave={async (data) => {
                                const live = executions.find(
                                  (e) => e.routineExecutionId === exec.id && e.exerciseId === ex.id,
                                );
                                if (live) await update(live.id, data);
                                else await add(data);
                              }}
                            />
                          );
                        })}
                      </View>
                    ))}
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
          <Pressable style={[styles.menuCard, { top: menuY + 4 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.menuHeader}>
              <Pressable hitSlop={8} onPress={() => setMenuExec(null)}>
                <MaterialIcons name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
            <Pressable style={styles.menuItem} onPress={() => { const e = menuExec; setMenuExec(null); setReschedulingExec(e); }}>
              <MaterialIcons name="event" size={18} color={colors.accent} />
              <Text style={styles.menuItemText}>Reschedule</Text>
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
      <RNModal visible={reschedulingExec !== null} transparent animationType="fade" onRequestClose={() => setReschedulingExec(null)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setReschedulingExec(null)}>
          <Pressable style={styles.rescheduleCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.menuTitle}>Move to</Text>
            <DatePicker
              value={reschedulingExec?.dueDate ?? todayISO()}
              onChange={async (newDate) => {
                if (reschedulingExec && newDate !== reschedulingExec.dueDate) {
                  await reschedule(reschedulingExec, newDate);
                }
                setReschedulingExec(null);
              }}
            />
          </Pressable>
        </Pressable>
      </RNModal>

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
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 3 },
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
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 160,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  menuHeader: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: 2,
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
  rescheduleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    padding: spacing.lg,
    gap: spacing.md,
  },
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
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
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
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
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
});
