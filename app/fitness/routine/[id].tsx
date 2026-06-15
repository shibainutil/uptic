import { useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { useExercises, useRoutines, useRoutineExecutions } from '../../../src/store/gymStore';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { Segmented } from '../../../src/components/ui/Segmented';
import { DatePicker } from '../../../src/components/ui/DatePicker';
import { colors, spacing, font, radius } from '../../../src/theme';
import { todayISO, fromISO } from '../../../src/lib/schedule';
import {
  type ScheduleFrequency, type RoutineSchedule, type Routine, type RoutineExecution,
} from '../../../src/types/gym';

// Display Monday-first; values are JS getDay() (Sun=0..Sat=6).
const WEEK_DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const STATUS_COLOR: Record<RoutineExecution['status'], string> = {
  pending: colors.textMuted,
  completed: '#22C55E',
  failed: colors.danger,
};

export default function RoutineEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { routines, loaded } = useRoutines(user?.uid);

  const isNew = id === 'new';
  const existing = isNew ? undefined : routines.find((r) => r.id === id);

  // Wait for Firestore to load before mounting the form, otherwise the form's
  // initial state captures empty defaults instead of the saved routine values.
  if (!isNew && !loaded) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Header title="Routine" onBack={() => router.back()} />
        <View style={styles.empty}><Text style={styles.emptyText}>Loading…</Text></View>
      </SafeAreaView>
    );
  }
  if (!isNew && !existing) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Header title="Routine" onBack={() => router.back()} />
        <View style={styles.empty}><Text style={styles.emptyText}>Routine not found.</Text></View>
      </SafeAreaView>
    );
  }

  return <RoutineForm key={existing?.id ?? 'new'} existing={existing} />;
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 48 }} />
    </View>
  );
}

function RoutineForm({ existing }: { existing?: Routine }) {
  const router = useRouter();
  const { user } = useAuth();
  const { exercises } = useExercises(user?.uid);
  const { add, update } = useRoutines(user?.uid);
  const { routineExecutions } = useRoutineExecutions(user?.uid);

  const isNew = !existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [exerciseIds, setExerciseIds] = useState<string[]>(existing?.exerciseIds ?? []);
  const [frequency, setFrequency] = useState<ScheduleFrequency>(existing?.schedule.frequency ?? 'weekly');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(existing?.schedule.daysOfWeek ?? []);
  const [dayOfMonth, setDayOfMonth] = useState(String(existing?.schedule.dayOfMonth ?? 1));
  const [graceDays, setGraceDays] = useState(String(existing?.graceDays ?? 2));
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayISO());
  const [saving, setSaving] = useState(false);

  const history = useMemo(
    () => routineExecutions
      .filter((e) => e.routineId === existing?.id)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
      .slice(0, 12),
    [routineExecutions, existing?.id],
  );

  function toggleExercise(exId: string) {
    setExerciseIds((cur) => (cur.includes(exId) ? cur.filter((x) => x !== exId) : [...cur, exId]));
  }
  function toggleDay(d: number) {
    setDaysOfWeek((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  async function save() {
    if (!name.trim() || saving) return;
    if (frequency === 'weekly' && daysOfWeek.length === 0) {
      Alert.alert('Pick a day', 'Choose at least one weekday for a weekly routine.');
      return;
    }
    const dom = parseInt(dayOfMonth);
    if (frequency === 'monthly' && (!dom || dom < 1 || dom > 31)) {
      Alert.alert('Invalid day', 'Day of month must be between 1 and 31.');
      return;
    }

    const schedule: RoutineSchedule = { frequency };
    if (frequency === 'weekly') schedule.daysOfWeek = daysOfWeek.slice().sort((a, b) => a - b);
    if (frequency === 'monthly') schedule.dayOfMonth = dom;

    const data: Omit<Routine, 'id' | 'createdAt'> = {
      name: name.trim(),
      description: description.trim() || undefined,
      exerciseIds,
      schedule,
      graceDays: Math.max(0, parseInt(graceDays) || 0),
      startDate,
    };

    setSaving(true);
    try {
      if (isNew) await add(data);
      else await update(existing!.id, data);
      router.back();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save routine.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Header title={isNew ? 'New Routine' : 'Edit Routine'} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Biceps & Shoulders" />
        <Input label="Description (optional)" value={description} onChangeText={setDescription} placeholder="Notes" />

        <View style={styles.field}>
          <Text style={styles.label}>Exercises</Text>
          {exercises.length === 0 ? (
            <Text style={styles.hint}>Add exercises in the Exercises tab first.</Text>
          ) : (
            <View style={styles.chips}>
              {exercises.map((ex) => {
                const active = exerciseIds.includes(ex.id);
                return (
                  <Pressable key={ex.id} onPress={() => toggleExercise(ex.id)} style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{ex.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Schedule</Text>
          <Segmented
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
            value={frequency}
            onChange={(v) => setFrequency(v)}
          />
        </View>

        {frequency === 'weekly' && (
          <View style={styles.field}>
            <Text style={styles.label}>On days</Text>
            <View style={styles.chips}>
              {WEEK_DAYS.map((d) => {
                const active = daysOfWeek.includes(d.value);
                return (
                  <Pressable key={d.value} onPress={() => toggleDay(d.value)} style={[styles.dayChip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {frequency === 'monthly' && (
          <Input label="Day of month (1–31)" value={dayOfMonth} onChangeText={setDayOfMonth} keyboardType="numeric" />
        )}

        <View style={styles.row2}>
          <View style={styles.flex1}>
            <Input label="Grace days" value={graceDays} onChangeText={setGraceDays} keyboardType="numeric" />
          </View>
          <View style={styles.flex1}>
            <DatePicker label="Start date" value={startDate} onChange={setStartDate} />
          </View>
        </View>

        {!isNew && history.length > 0 && (
          <View style={styles.field}>
            <Text style={styles.label}>Recent executions</Text>
            {history.map((h) => (
              <View key={h.id} style={styles.histRow}>
                <View style={[styles.histDot, { backgroundColor: STATUS_COLOR[h.status] }]} />
                <Text style={styles.histDate}>
                  {fromISO(h.dueDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
                <Text style={[styles.histStatus, { color: STATUS_COLOR[h.status] }]}>{h.status}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.formRow}>
          <Button label="Cancel" onPress={() => router.back()} style={styles.flex1} disabled={saving} />
          <Button label={isNew ? 'Create' : 'Save'} variant="primary" onPress={save} disabled={!name.trim() || saving} style={styles.flex1} />
        </View>
      </ScrollView>
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
  body: { padding: spacing.lg, gap: spacing.lg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textDim, fontSize: font.md },
  field: { gap: spacing.sm },
  label: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  hint: { color: colors.textDim, fontSize: font.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  dayChip: {
    width: 52,
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: `${colors.accent}22` },
  chipText: { color: colors.textMuted, fontSize: font.sm },
  chipTextActive: { color: colors.accent },
  row2: { flexDirection: 'row', gap: spacing.md },
  flex1: { flex: 1 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  histDot: { width: 8, height: 8, borderRadius: 4 },
  histDate: { flex: 1, color: colors.text, fontSize: font.sm },
  histStatus: { fontSize: font.sm, fontWeight: '600', textTransform: 'capitalize' },
  formRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
