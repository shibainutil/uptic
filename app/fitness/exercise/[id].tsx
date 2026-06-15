import { useMemo, useState } from 'react';
import {
  View, Text, Image, FlatList, Pressable, StyleSheet, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useExercises, useExerciseExecutions } from '../../../src/store/gymStore';
import { Modal } from '../../../src/components/ui/Modal';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { Picker } from '../../../src/components/ui/Picker';
import { Toggle } from '../../../src/components/ui/Toggle';
import { DatePicker } from '../../../src/components/ui/DatePicker';
import { colors, spacing, font, radius } from '../../../src/theme';
import { todayISO, fromISO } from '../../../src/lib/schedule';
import {
  type Exercise, type ExerciseExecution, type ParamValue, exerciseType,
} from '../../../src/types/gym';

interface ExecForm {
  date: string;
  series: string;
  reps: string;
  durationMin: string;
  weight: string;
  weightUnit: 'kg' | 'lbs';
  paramValues: Record<string, string>;
  notes: string;
  completed: boolean;
}

function emptyForm(ex: Exercise): ExecForm {
  return {
    date: todayISO(),
    series: String(ex.series ?? 3),
    reps: String(ex.repsMin ?? 8),
    durationMin: String(ex.durationMin ?? 30),
    weight: '',
    weightUnit: 'kg',
    paramValues: {},
    notes: '',
    completed: false,
  };
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { exercises } = useExercises(user?.uid);
  const { executions, add, update, remove } = useExerciseExecutions(user?.uid);

  const exercise = exercises.find((e) => e.id === id);

  const [editing, setEditing] = useState<'add' | ExerciseExecution | null>(null);
  const [form, setForm] = useState<ExecForm | null>(null);

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
  const requiredParams = params.filter((p) => p.required);

  function openAdd() {
    setForm(emptyForm(exercise!));
    setEditing('add');
  }

  function openEdit(exec: ExerciseExecution) {
    const pv: Record<string, string> = {};
    (exec.paramValues ?? []).forEach((p) => { pv[p.paramId] = p.value; });
    setForm({
      date: exec.date,
      series: String(exec.series ?? exercise!.series ?? 3),
      reps: String(exec.reps ?? exercise!.repsMin ?? 8),
      durationMin: String(exec.durationMin ?? exercise!.durationMin ?? 30),
      weight: exec.weight != null ? String(exec.weight) : '',
      weightUnit: exec.weightUnit ?? 'kg',
      paramValues: pv,
      notes: exec.notes ?? '',
      completed: exec.completed,
    });
    setEditing(exec);
  }

  const missingRequired = form
    ? requiredParams.filter((p) => !(form.paramValues[p.id] ?? '').trim()).map((p) => p.name)
    : [];

  async function save() {
    if (!form || !exercise) return;
    if (form.completed && missingRequired.length > 0) {
      Alert.alert('Cannot complete', `Fill required parameter(s): ${missingRequired.join(', ')}`);
      return;
    }
    const paramValues: ParamValue[] = params
      .map((p) => ({ paramId: p.id, value: (form.paramValues[p.id] ?? '').trim() }))
      .filter((p) => p.value);

    const data: Omit<ExerciseExecution, 'id' | 'createdAt'> = {
      exerciseId: exercise.id,
      date: form.date,
      paramValues,
      completed: form.completed,
      notes: form.notes.trim() || undefined,
    };
    if (isStrength) {
      data.series = parseInt(form.series) || undefined;
      data.reps = parseInt(form.reps) || undefined;
      if (form.weight.trim()) { data.weight = parseFloat(form.weight); data.weightUnit = form.weightUnit; }
    } else {
      data.durationMin = parseInt(form.durationMin) || undefined;
    }

    if (editing === 'add') await add(data);
    else if (editing && typeof editing === 'object') await update(editing.id, data);
    setEditing(null);
    setForm(null);
  }

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

      <Modal
        title={editing === 'add' ? 'Log Execution' : 'Edit Execution'}
        visible={editing !== null}
        onClose={() => { setEditing(null); setForm(null); }}
      >
        {form && (
          <View style={styles.form}>
            <DatePicker label="Date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />

            {isStrength ? (
              <>
                <View style={styles.row3}>
                  <Input label="Series" value={form.series} onChangeText={(v) => setForm({ ...form, series: v })} keyboardType="numeric" style={styles.flex1} />
                  <Input label="Reps" value={form.reps} onChangeText={(v) => setForm({ ...form, reps: v })} keyboardType="numeric" style={styles.flex1} />
                  <Input label="Weight" value={form.weight} onChangeText={(v) => setForm({ ...form, weight: v })} keyboardType="decimal-pad" placeholder="opt" style={styles.flex1} />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Unit</Text>
                  <Picker options={['kg', 'lbs']} value={form.weightUnit} onChange={(v) => setForm({ ...form, weightUnit: v as 'kg' | 'lbs' })} />
                </View>
              </>
            ) : (
              <Input label="Duration (minutes)" value={form.durationMin} onChangeText={(v) => setForm({ ...form, durationMin: v })} keyboardType="numeric" />
            )}

            {params.map((p) => (
              <Input
                key={p.id}
                label={`${p.name}${p.unit ? ` (${p.unit})` : ''}${p.required ? ' *' : ''}`}
                value={form.paramValues[p.id] ?? ''}
                onChangeText={(v) => setForm({ ...form, paramValues: { ...form.paramValues, [p.id]: v } })}
                placeholder={p.required ? 'Required' : 'Optional'}
              />
            ))}

            <Input label="Notes (optional)" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} placeholder="Any notes" />

            <View style={styles.completeRow}>
              <Toggle value={form.completed} onChange={(v) => setForm({ ...form, completed: v })} label="Mark as completed" />
            </View>
            {form.completed && missingRequired.length > 0 ? (
              <Text style={styles.warn}>Fill required: {missingRequired.join(', ')}</Text>
            ) : null}

            <View style={styles.formRow}>
              <Button label="Cancel" onPress={() => { setEditing(null); setForm(null); }} style={styles.flex1} />
              <Button label="Save" variant="primary" onPress={save} style={styles.flex1} />
            </View>
          </View>
        )}
      </Modal>
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
  form: { gap: spacing.lg },
  formField: { gap: spacing.xs },
  formLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  row3: { flexDirection: 'row', gap: spacing.md },
  flex1: { flex: 1 },
  completeRow: { marginTop: spacing.xs },
  warn: { color: colors.danger, fontSize: font.sm },
  formRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
