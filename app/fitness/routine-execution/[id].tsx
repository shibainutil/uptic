import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Image, ScrollView, Pressable, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import {
  useRoutines, useRoutineExecutions, useExercises, useExerciseExecutions,
} from '../../../src/store/gymStore';
import { ExecutionFormModal } from '../../../src/components/gym/ExecutionFormModal';
import { colors, spacing, font, radius } from '../../../src/theme';
import { fromISO, withinGrace, todayISO, diffDays } from '../../../src/lib/schedule';
import { type Exercise, type ExerciseExecution, exerciseType, type SeriesEntry } from '../../../src/types/gym';

const STATUS_COLOR = { pending: colors.accent, completed: '#22C55E', failed: colors.danger } as const;

export default function RoutineExecutionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { routines } = useRoutines(user?.uid);
  const { routineExecutions, loaded, setStatus } = useRoutineExecutions(user?.uid);
  const { exercises } = useExercises(user?.uid);
  const { executions, add, update, remove } = useExerciseExecutions(user?.uid);

  const routineExec = routineExecutions.find((e) => e.id === id);
  const routine = routineExec ? routines.find((r) => r.id === routineExec.routineId) : undefined;

  const [formExercise, setFormExercise] = useState<Exercise | null>(null);
  const [editingExec, setEditingExec] = useState<ExerciseExecution | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Executions logged against this routine execution.
  const linked = useMemo(
    () => executions.filter((e) => e.routineExecutionId === id),
    [executions, id],
  );
  // Stable signature so the auto-complete effect doesn't run on every render.
  const linkedKey = useMemo(
    () => linked.map((e) => `${e.exerciseId}:${e.completed ? 1 : 0}`).sort().join(','),
    [linked],
  );

  const routineExercises = useMemo(
    () => (routine?.exerciseIds ?? []).map((eid) => exercises.find((e) => e.id === eid)).filter(Boolean) as Exercise[],
    [routine, exercises],
  );

  function linkedExecFor(exId: string): ExerciseExecution | undefined {
    return linked.find((e) => e.exerciseId === exId);
  }

  function doneExecFor(exId: string): ExerciseExecution | undefined {
    return linked.find((e) => e.exerciseId === exId && e.completed);
  }

  function seriesCircles(ex: Exercise): boolean[] {
    const count = ex.series ?? 3;
    const exec = linkedExecFor(ex.id);
    if (!exec) return Array(count).fill(false);
    if (exec.seriesData && exec.seriesData.length > 0) {
      return Array.from({ length: count }, (_, i) => {
        const s = (exec.seriesData as SeriesEntry[])[i];
        return s != null && s.reps != null && s.weight != null;
      });
    }
    return Array(count).fill(exec.completed);
  }

  const total = routine?.exerciseIds.length ?? 0;
  const doneCount = (routine?.exerciseIds ?? []).filter((eid) => linked.some((e) => e.exerciseId === eid && e.completed)).length;
  const inGrace = routineExec ? withinGrace(routineExec.dueDate, routine?.graceDays ?? 0, todayISO()) : false;
  const interactive = routineExec ? (routineExec.status !== 'failed') && (inGrace || routineExec.status === 'completed') : false;

  // Keep the routine-execution status in sync with per-exercise progress.
  useEffect(() => {
    if (!routineExec || !routine || total === 0) return;
    const allDone = routine.exerciseIds.every((eid) => linked.some((e) => e.exerciseId === eid && e.completed));
    if (allDone && routineExec.status !== 'completed') {
      setStatus(routineExec.id, 'completed');
    } else if (!allDone && routineExec.status === 'completed') {
      setStatus(routineExec.id, 'pending');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedKey, routineExec?.status, total]);

  function openLog(ex: Exercise) {
    setFormExercise(ex);
    setEditingExec(linkedExecFor(ex.id) ?? null);
    setFormOpen(true);
  }

  if (!loaded) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Header onBack={() => router.back()} title="Routine" />
        <View style={styles.empty}><Text style={styles.emptyText}>Loading…</Text></View>
      </SafeAreaView>
    );
  }

  if (!routineExec || !routine) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Header onBack={() => router.back()} title="Routine" />
        <View style={styles.empty}><Text style={styles.emptyText}>This routine execution no longer exists.</Text></View>
      </SafeAreaView>
    );
  }

  const overdueBy = diffDays(todayISO(), routineExec.dueDate);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Header onBack={() => router.back()} title={routine.name} />

      <ScrollView contentContainerStyle={styles.body}>
        {/* Status / progress card */}
        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            <Text style={styles.dueDate}>
              {fromISO(routineExec.dueDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLOR[routineExec.status]}22` }]}>
              <Text style={[styles.statusBadgeText, { color: STATUS_COLOR[routineExec.status] }]}>
                {routineExec.status}
              </Text>
            </View>
          </View>

          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: total ? `${(doneCount / total) * 100}%` : '0%' }]} />
          </View>
          <Text style={styles.progressText}>{doneCount} / {total} exercises done</Text>

          {routineExec.status === 'failed' && (
            <Text style={styles.expiredNote}>Grace period passed — this routine execution can no longer be completed.</Text>
          )}
          {routineExec.status === 'pending' && !inGrace && (
            <Text style={styles.expiredNote}>Overdue by {overdueBy} day{overdueBy !== 1 ? 's' : ''} (grace {routine.graceDays}).</Text>
          )}
        </View>

        <Text style={styles.sectionLabel}>Exercises</Text>

        {routineExercises.length === 0 ? (
          <Text style={styles.hint}>This routine has no exercises. Add some in the routine settings.</Text>
        ) : (
          routineExercises.map((ex) => {
            const done = doneExecFor(ex.id);
            const isStrength = exerciseType(ex) === 'strength';
            return (
              <Pressable
                key={ex.id}
                style={styles.exRow}
                onPress={() => interactive && openLog(ex)}
                disabled={!interactive}
              >
                {ex.imageUri ? (
                  <Image source={{ uri: ex.imageUri }} style={styles.exThumb} />
                ) : (
                  <View style={[styles.exThumb, styles.exThumbPlaceholder]}>
                    <MaterialIcons name={isStrength ? 'fitness-center' : 'directions-run'} size={20} color={colors.textMuted} />
                  </View>
                )}
                <View style={styles.exMain}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  <Text style={styles.exMeta}>
                    {isStrength ? `${ex.series ?? 3} × ${ex.repsMin ?? 8}–${ex.repsMax ?? 10}` : `${ex.durationMin ?? 30} min`}
                  </Text>
                </View>
                <View style={styles.circles}>
                  {seriesCircles(ex).map((isDone, si) => (
                    <MaterialIcons
                      key={si}
                      name={isDone ? 'check-circle' : 'radio-button-unchecked'}
                      size={20}
                      color={isDone ? '#22C55E' : interactive ? colors.textMuted : colors.textDim}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {formExercise && (
        <ExecutionFormModal
          exercise={formExercise}
          execution={editingExec}
          visible={formOpen}
          defaultDate={routineExec.dueDate}
          defaultCompleted
          routineExecutionId={routineExec.id}
          lockDate
          onClose={() => { setFormOpen(false); setFormExercise(null); setEditingExec(null); }}
          onSubmit={async (data) => {
            if (editingExec) await update(editingExec.id, data);
            else await add(data);
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 48 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  back: { width: 48 },
  backText: { color: colors.accent, fontSize: font.md },
  headerTitle: { flex: 1, color: colors.text, fontSize: font.lg, fontWeight: '600', textAlign: 'center' },
  body: { padding: spacing.lg, gap: spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center' },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  statusTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dueDate: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  statusBadgeText: { fontSize: font.sm, fontWeight: '700', textTransform: 'capitalize' },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressBarFill: { height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  progressText: { color: colors.textMuted, fontSize: font.sm },
  expiredNote: { color: colors.danger, fontSize: font.sm, marginTop: spacing.xs },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.sm,
  },
  hint: { color: colors.textDim, fontSize: font.sm },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.md,
  },
  exThumb: { width: 44, height: 44, borderRadius: radius.sm },
  exThumbPlaceholder: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  exMain: { flex: 1 },
  exName: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  exMeta: { color: colors.textDim, fontSize: font.sm, marginTop: 2 },
  circles: { flexDirection: 'row', gap: 4, alignItems: 'center' },
});
