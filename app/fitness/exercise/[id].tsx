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
import { colors, spacing, font, radius } from '../../../src/theme';
import { fromISO } from '../../../src/lib/schedule';
import { type ExerciseExecution, exerciseType } from '../../../src/types/gym';

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { exercises } = useExercises(user?.uid);
  const { executions, add, update, remove } = useExerciseExecutions(user?.uid);

  const exercise = exercises.find((e) => e.id === id);

  const [formOpen, setFormOpen] = useState(false);
  const [editingExec, setEditingExec] = useState<ExerciseExecution | null>(null);

  const myExecutions = useMemo(
    () => executions.filter((e) => e.exerciseId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [executions, id],
  );

  if (!exercise) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
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

  function execMeta(exec: ExerciseExecution): string {
    const parts: string[] = [];
    if (isStrength) {
      if (exec.series || exec.reps) parts.push(`${exec.series ?? '?'} × ${exec.reps ?? '?'}`);
      if (exec.weight != null) parts.push(`${exec.weight} ${exec.weightUnit}`);
    } else if (exec.durationMin != null) {
      parts.push(`${exec.durationMin} min`);
    }
    (exec.paramValues ?? []).forEach((pv) => {
      const p = params.find((x) => x.id === pv.paramId);
      if (p) parts.push(`${p.name}: ${pv.value}${p.unit ? ` ${p.unit}` : ''}`);
    });
    return parts.join('  ·  ');
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{exercise.name}</Text>
        <View style={{ width: 48 }} />
      </View>

      <FlatList
        data={myExecutions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.summary}>
            {exercise.imageUri ? (
              <Image source={{ uri: exercise.imageUri }} style={styles.summaryImage} />
            ) : (
              <View style={[styles.summaryImage, styles.summaryImagePlaceholder]}>
                <MaterialIcons name={isStrength ? 'fitness-center' : 'directions-run'} size={32} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.summaryMain}>
              <Text style={styles.summaryType}>{isStrength ? 'Strength' : 'Cardio'}{exercise.muscleGroup ? `  ·  ${exercise.muscleGroup}` : ''}</Text>
              <Text style={styles.summaryDefaults}>
                {isStrength
                  ? `${exercise.series ?? 3} × ${exercise.repsMin ?? 8}–${exercise.repsMax ?? 10}`
                  : `${exercise.durationMin ?? 30} min`}
              </Text>
              {params.length > 0 ? (
                <Text style={styles.summaryParams}>
                  {params.map((p) => `${p.name}${p.required ? '*' : ''}`).join(', ')}
                </Text>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="event-note" size={40} color={colors.textDim} />
            <Text style={styles.emptyText}>No executions logged yet.</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={[styles.statusDot, item.completed ? styles.dotDone : styles.dotPending]} />
            <View style={styles.cardMain}>
              <Text style={styles.cardDate}>
                {fromISO(item.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
              {execMeta(item) ? <Text style={styles.cardMeta}>{execMeta(item)}</Text> : null}
              {item.notes ? <Text style={styles.cardNotes}>{item.notes}</Text> : null}
              <Text style={[styles.cardStatus, item.completed ? styles.statusDone : styles.statusPending]}>
                {item.completed ? 'Completed' : 'In progress'}
              </Text>
            </View>
            <View style={styles.cardActions}>
              <Pressable onPress={() => openEdit(item)} hitSlop={8}><Text style={styles.actionEdit}>Edit</Text></Pressable>
              <Pressable onPress={() => confirmDelete(item)} hitSlop={8}><Text style={styles.actionDelete}>Delete</Text></Pressable>
            </View>
          </View>
        )}
        ListFooterComponent={
          <Pressable onPress={openAdd} style={styles.addRow}>
            <Text style={styles.addRowText}>+ Log Execution</Text>
          </Pressable>
        }
      />

      <ExecutionFormModal
        exercise={exercise}
        execution={editingExec}
        visible={formOpen}
        onClose={() => { setFormOpen(false); setEditingExec(null); }}
        onSubmit={async (data) => {
          if (editingExec) await update(editingExec.id, data);
          else await add(data);
        }}
      />
    </SafeAreaView>
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
  list: { padding: spacing.lg },
  summary: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryImage: { width: 72, height: 72, borderRadius: radius.sm },
  summaryImagePlaceholder: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  summaryMain: { flex: 1, justifyContent: 'center', gap: 2 },
  summaryType: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDefaults: { color: colors.text, fontSize: font.lg, fontWeight: '600' },
  summaryParams: { color: colors.textDim, fontSize: font.sm },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.lg,
    gap: spacing.md,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  dotDone: { backgroundColor: '#22C55E' },
  dotPending: { backgroundColor: colors.textMuted },
  cardMain: { flex: 1 },
  cardDate: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  cardMeta: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  cardNotes: { color: colors.textDim, fontSize: font.sm, marginTop: 4 },
  cardStatus: { fontSize: font.sm, marginTop: 4, fontWeight: '600' },
  statusDone: { color: '#22C55E' },
  statusPending: { color: colors.textMuted },
  cardActions: { gap: spacing.md, alignItems: 'flex-end' },
  actionEdit: { color: colors.accent, fontSize: font.sm },
  actionDelete: { color: colors.danger, fontSize: font.sm },
  addRow: {
    marginTop: spacing.md,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addRowText: { color: colors.textMuted, fontSize: font.md },
});
