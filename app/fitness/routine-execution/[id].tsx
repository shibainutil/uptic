import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Image, ScrollView, Pressable, StyleSheet, Modal as RNModal,
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
import { fromISO, todayISO, diffDays } from '../../../src/lib/schedule';
import { type Exercise, type ExerciseExecution, exerciseType, type SetEntry, effectiveExerciseIds } from '../../../src/types/gym';

const STATUS_COLOR = { pending: colors.accent, completed: '#22C55E', failed: colors.danger } as const;

export default function RoutineExecutionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { routines } = useRoutines(user?.uid);
  const {
    routineExecutions, loaded, setStatus,
    addExerciseToExecution, removeExerciseFromExecution, replaceExerciseInExecution,
  } = useRoutineExecutions(user?.uid);
  const { exercises } = useExercises(user?.uid);
  const { executions, add, update, remove } = useExerciseExecutions(user?.uid);

  const routineExec = routineExecutions.find((e) => e.id === id);
  const routine = routineExec ? routines.find((r) => r.id === routineExec.routineId) : undefined;

  const [pickerMode, setPickerMode] = useState<'add' | 'replace' | null>(null);
  const [replacingExId, setReplacingExId] = useState<string | null>(null);

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

  const execExerciseIds = useMemo(
    () => (routineExec ? effectiveExerciseIds(routine, routineExec) : []),
    [routine, routineExec],
  );

  const routineExercises = useMemo(
    () => execExerciseIds.map((eid) => exercises.find((e) => e.id === eid)).filter(Boolean) as Exercise[],
    [execExerciseIds, exercises],
  );

  function linkedExecFor(exId: string): ExerciseExecution | undefined {
    return linked.find((e) => e.exerciseId === exId);
  }

  function doneExecFor(exId: string): ExerciseExecution | undefined {
    return linked.find((e) => e.exerciseId === exId && e.completed);
  }

  function setCircles(ex: Exercise): boolean[] {
    const count = ex.sets ?? 3;
    const exec = linkedExecFor(ex.id);
    if (!exec) return Array(count).fill(false);
    if (exec.setData && exec.setData.length > 0) {
      return Array.from({ length: count }, (_, i) => {
        const s = (exec.setData as SetEntry[])[i];
        return s != null && s.reps != null && s.weight != null;
      });
    }
    return Array(count).fill(exec.completed);
  }

  const total = execExerciseIds.length;
  const doneCount = execExerciseIds.filter((eid) => linked.some((e) => e.exerciseId === eid && e.completed)).length;
  const notPastDue = routineExec ? diffDays(todayISO(), routineExec.dueDate) <= 0 : false;
  const interactive = routineExec ? (routineExec.status !== 'failed') && (notPastDue || routineExec.status === 'completed') : false;

  // Keep the routine-execution status in sync with per-exercise progress.
  useEffect(() => {
    if (!routineExec || !routine || total === 0) return;
    const allDone = execExerciseIds.every((eid) => linked.some((e) => e.exerciseId === eid && e.completed));
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
            <Text style={styles.expiredNote}>This routine execution can no longer be completed.</Text>
          )}
          {routineExec.status === 'pending' && !notPastDue && (
            <Text style={styles.expiredNote}>Overdue by {overdueBy} day{overdueBy !== 1 ? 's' : ''}.</Text>
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
                    {isStrength ? `${ex.sets ?? 3} × ${ex.repsMin ?? 8}–${ex.repsMax ?? 10}` : `${ex.durationMin ?? 30} min`}
                  </Text>
                </View>
                <View style={styles.circles}>
                  {setCircles(ex).map((isDone, si) => (
                    <MaterialIcons
                      key={si}
                      name={isDone ? 'check-circle' : 'radio-button-unchecked'}
                      size={20}
                      color={isDone ? '#22C55E' : interactive ? colors.textMuted : colors.textDim}
                    />
                  ))}
                </View>
                {interactive && (
                  <Pressable
                    hitSlop={8}
                    onPress={() => { setReplacingExId(ex.id); setPickerMode('replace'); }}
                    style={styles.exSwapBtn}
                  >
                    <MaterialIcons name="swap-horiz" size={20} color={colors.textMuted} />
                  </Pressable>
                )}
              </Pressable>
            );
          })
        )}

        {interactive && (
          <Pressable onPress={() => { setReplacingExId(null); setPickerMode('add'); }} style={styles.addExerciseRow}>
            <MaterialIcons name="add" size={18} color={colors.accent} />
            <Text style={styles.addExerciseText}>Add exercise (this occurrence only)</Text>
          </Pressable>
        )}
      </ScrollView>

      <RNModal visible={pickerMode !== null} transparent animationType="fade" onRequestClose={() => setPickerMode(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPickerMode(null)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>
              {pickerMode === 'replace' ? 'Replace with' : 'Add exercise'}
            </Text>
            <ScrollView style={styles.pickerList}>
              {exercises
                .filter((e) => !execExerciseIds.includes(e.id) || e.id === replacingExId)
                .filter((e) => e.id !== replacingExId)
                .map((e) => (
                  <Pressable
                    key={e.id}
                    style={styles.pickerItem}
                    onPress={async () => {
                      if (!routineExec) return;
                      if (pickerMode === 'replace' && replacingExId) {
                        await replaceExerciseInExecution(routineExec, replacingExId, e.id);
                      } else {
                        await addExerciseToExecution(routineExec, e.id);
                      }
                      setPickerMode(null);
                      setReplacingExId(null);
                    }}
                  >
                    <Text style={styles.pickerItemText}>{e.name}</Text>
                  </Pressable>
                ))}
            </ScrollView>
            {pickerMode === 'replace' && replacingExId && (
              <Pressable
                style={styles.pickerRemoveBtn}
                onPress={async () => {
                  if (!routineExec || !replacingExId) return;
                  await removeExerciseFromExecution(routineExec, replacingExId);
                  setPickerMode(null);
                  setReplacingExId(null);
                }}
              >
                <Text style={styles.pickerRemoveText}>Remove instead (no replacement)</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </RNModal>

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
  exSwapBtn: { marginLeft: spacing.sm, padding: 2 },
  addExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginTop: spacing.xs,
  },
  addExerciseText: { color: colors.accent, fontSize: font.md },
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
