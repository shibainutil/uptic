import { useMemo, useState } from 'react';
import {
  View, Text, Image, FlatList, Pressable, StyleSheet, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useExercises, useExerciseExecutions } from '../../../src/store/gymStore';
import { ExecutionFormModal } from '../../../src/components/gym/ExecutionFormModal';
import { ExerciseFormModal, uploadExerciseImage } from '../../../src/components/gym/ExerciseFormModal';
import { colors, spacing, font, radius } from '../../../src/theme';
import { fromISO, todayISO, addDays } from '../../../src/lib/schedule';
import { type ExerciseExecution, type Exercise, type SeriesEntry, exerciseType, exerciseMuscleGroup } from '../../../src/types/gym';

function totalScore(exec: ExerciseExecution): number {
  if (exec.seriesData && exec.seriesData.length > 0) {
    return exec.seriesData.reduce((s: number, e: SeriesEntry) => s + (e.reps ?? 0) * (e.weight ?? 0), 0);
  }
  return (exec.reps ?? 0) * (exec.weight ?? 0);
}

function fmtDate(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShortDate(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { exercises, update } = useExercises(user?.uid);
  const { executions, add, update: updateExec, remove } = useExerciseExecutions(user?.uid);

  const exercise = exercises.find((e) => e.id === id);

  const [formOpen, setFormOpen] = useState(false);
  const [editingExec, setEditingExec] = useState<ExerciseExecution | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const myExecutions = useMemo(
    () => executions.filter((e) => e.exerciseId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [executions, id],
  );

  const cutoff = addDays(todayISO(), -30);
  const recentExecs = myExecutions.filter((e) => e.date >= cutoff);
  const displayed = showAll ? myExecutions : recentExecs;
  const hasOlder = myExecutions.length > recentExecs.length;

  const firstExec = myExecutions.length > 0 ? myExecutions[myExecutions.length - 1] : null;
  const latestExec = myExecutions.length > 0 ? myExecutions[0] : null;
  const recordExec = myExecutions.length > 0
    ? myExecutions.reduce((best, e) => (totalScore(e) > totalScore(best) ? e : best), myExecutions[0])
    : null;

  if (!exercise) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerSide}><Text style={styles.backText}>‹ Back</Text></Pressable>
          <View style={styles.headerCenter} />
          <View style={styles.headerSide} />
        </View>
        <View style={styles.empty}><Text style={styles.emptyText}>Exercise not found.</Text></View>
      </SafeAreaView>
    );
  }

  const isStrength = exerciseType(exercise) === 'strength';
  const params = exercise.params ?? [];

  function openAdd() { setEditingExec(null); setFormOpen(true); }
  function openEdit(exec: ExerciseExecution) { setEditingExec(exec); setFormOpen(true); }

  function confirmDelete(exec: ExerciseExecution) {
    Alert.alert('Delete Execution', 'Remove this logged execution?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(exec.id) },
    ]);
  }

  async function handleEditExerciseSave(
    data: Omit<Exercise, 'id' | 'createdAt'>,
    pendingImageUri?: string | null,
    removeImage?: boolean,
  ) {
    const uid = user?.uid;
    if (pendingImageUri && uid) {
      const imageUri = await uploadExerciseImage(uid, exercise.id, pendingImageUri);
      await update(exercise.id, { ...data, imageUri });
    } else if (removeImage) {
      await update(exercise.id, { ...data, imageUri: '' });
    } else {
      await update(exercise.id, data);
    }
    setEditModalOpen(false);
  }

  const summaryDefaults = isStrength
    ? `${exercise.series ?? 3} × ${exercise.repsMin ?? 8}–${exercise.repsMax ?? 10}`
    : `${exercise.durationMin ?? 30} min`;

  const summarySubtitle = isStrength
    ? `Strength  ·  ${exerciseMuscleGroup(exercise)}`
    : 'Cardio';

  function StatChip({ label, exec }: { label: string; exec: ExerciseExecution | null }) {
    const score = exec ? totalScore(exec) : 0;
    return (
      <View style={styles.statChip}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statDate}>{exec ? fmtShortDate(exec.date) : '—'}</Text>
        {exec && score > 0 ? <Text style={styles.statScore}>{score.toLocaleString()} pts</Text> : null}
      </View>
    );
  }

  const ListHeader = (
    <View>
      <View style={styles.summary}>
        {exercise.imageUri ? (
          <Image source={{ uri: exercise.imageUri }} style={styles.summaryImage} />
        ) : (
          <View style={[styles.summaryImage, styles.summaryImagePlaceholder]}>
            <MaterialIcons name={isStrength ? 'fitness-center' : 'directions-run'} size={32} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.summaryMain}>
          <Text style={styles.summaryName}>{exercise.name}</Text>
          <Text style={styles.summaryType}>{summarySubtitle}</Text>
          <Text style={styles.summaryDefaults}>{summaryDefaults}</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <StatChip label="FIRST" exec={firstExec} />
        <View style={styles.statDivider} />
        <StatChip label="LATEST" exec={latestExec} />
        <View style={styles.statDivider} />
        <StatChip label="RECORD" exec={recordExec} />
      </View>
    </View>
  );

  const ListFooter = (
    <View style={styles.footer}>
      {hasOlder && !showAll && (
        <Pressable onPress={() => setShowAll(true)} style={styles.showOlderBtn}>
          <Text style={styles.showOlderText}>Show older executions</Text>
        </Pressable>
      )}
      <Pressable onPress={openAdd} style={styles.addRow}>
        <Text style={styles.addRowText}>+ Log Execution</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerSide}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{exercise.name}</Text>
        <Pressable onPress={() => setEditModalOpen(true)} style={[styles.headerSide, styles.headerRight]}>
          <MaterialIcons name="edit" size={20} color={colors.accent} />
        </Pressable>
      </View>

      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={styles.emptyExecs}>
            <MaterialIcons name="event-note" size={40} color={colors.textDim} />
            <Text style={styles.emptyText}>No executions logged yet.</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const score = totalScore(item);
          const hasSeriesData = item.seriesData && item.seriesData.length > 0;
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardDate}>{fmtDate(item.date)}</Text>
                <Text style={[styles.cardStatus, item.completed ? styles.statusDone : styles.statusPending]}>
                  {item.completed ? 'Completed' : 'In progress'}
                </Text>
              </View>

              {isStrength && (
                <View style={styles.seriesList}>
                  {hasSeriesData
                    ? item.seriesData!.map((s, idx) => (
                        <Text key={idx} style={styles.seriesRow}>
                          {'Set ' + (idx + 1) + '  ·  ' + (s.weight != null ? s.weight + 'kg' : '—') + ' × ' + (s.reps ?? '—') + ' reps'}
                        </Text>
                      ))
                    : (item.reps != null || item.series != null) && (
                        <Text style={styles.seriesRow}>
                          {'Set 1  ·  ' + (item.weight != null ? item.weight + (item.weightUnit ?? 'kg') : '—') + ' × ' + (item.reps ?? '—') + ' reps'}
                        </Text>
                      )}
                  {score > 0 && (
                    <Text style={styles.totalRow}>
                      {'Total  ·  ' + score.toLocaleString() + ' pts'}
                    </Text>
                  )}
                </View>
              )}

              {!isStrength && item.durationMin != null && (
                <Text style={styles.cardMeta}>{item.durationMin} min</Text>
              )}

              {(item.paramValues ?? []).length > 0 && (
                <Text style={styles.cardMeta}>
                  {(item.paramValues ?? []).map((pv) => {
                    const p = params.find((x) => x.id === pv.paramId);
                    return p ? `${p.name}: ${pv.value}${p.unit ? ` ${p.unit}` : ''}` : '';
                  }).filter(Boolean).join('  ·  ')}
                </Text>
              )}

              {item.notes ? <Text style={styles.cardNotes}>{item.notes}</Text> : null}

              <View style={styles.cardActions}>
                <Pressable onPress={() => openEdit(item)} hitSlop={8}><Text style={styles.actionEdit}>Edit</Text></Pressable>
                <Pressable onPress={() => confirmDelete(item)} hitSlop={8}><Text style={styles.actionDelete}>Delete</Text></Pressable>
              </View>
            </View>
          );
        }}
        ListFooterComponent={ListFooter}
      />

      <ExecutionFormModal
        exercise={exercise}
        execution={editingExec}
        visible={formOpen}
        onClose={() => { setFormOpen(false); setEditingExec(null); }}
        onSubmit={async (data) => {
          if (editingExec) await updateExec(editingExec.id, data);
          else await add(data);
        }}
      />

      <ExerciseFormModal
        userId={user?.uid ?? ''}
        exercise={exercise}
        visible={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={handleEditExerciseSave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerSide: { width: 56 },
  headerRight: { alignItems: 'flex-end' },
  backText: { color: colors.accent, fontSize: font.md },
  headerCenter: { flex: 1 },
  headerTitle: { flex: 1, color: colors.text, fontSize: font.lg, fontWeight: '600', textAlign: 'center' },
  list: { padding: spacing.lg, gap: spacing.sm },
  summary: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  summaryImage: { width: 80, height: 80, borderRadius: radius.sm },
  summaryImagePlaceholder: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  summaryMain: { flex: 1, justifyContent: 'center', gap: 2 },
  summaryName: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  summaryType: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDefaults: { color: colors.text, fontSize: font.md, fontWeight: '500', marginTop: 2 },
  statRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  statChip: { flex: 1, alignItems: 'center', padding: spacing.md, gap: 2 },
  statDivider: { width: 1, backgroundColor: colors.border },
  statLabel: { color: colors.textDim, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  statDate: { color: colors.text, fontSize: font.sm, fontWeight: '500' },
  statScore: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyExecs: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardDate: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  cardStatus: { fontSize: font.sm, fontWeight: '600' },
  statusDone: { color: '#22C55E' },
  statusPending: { color: colors.textMuted },
  seriesList: { gap: 3 },
  seriesRow: { color: colors.textMuted, fontSize: font.sm },
  totalRow: { color: colors.accent, fontSize: font.sm, fontWeight: '600', marginTop: 2 },
  cardMeta: { color: colors.textMuted, fontSize: font.sm },
  cardNotes: { color: colors.textDim, fontSize: font.sm },
  cardActions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  actionEdit: { color: colors.accent, fontSize: font.sm },
  actionDelete: { color: colors.danger, fontSize: font.sm },
  footer: { gap: spacing.md, marginTop: spacing.md },
  showOlderBtn: {
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  showOlderText: { color: colors.textMuted, fontSize: font.md },
  addRow: {
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addRowText: { color: colors.textMuted, fontSize: font.md },
});
