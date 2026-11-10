import { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { useHabits } from '../../../src/store/habitStore';
import { useGoals } from '../../../src/store/goalStore';
import { usePillars } from '../../../src/store/pillarStore';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { Segmented } from '../../../src/components/ui/Segmented';
import { DatePicker } from '../../../src/components/ui/DatePicker';
import { TimePicker } from '../../../src/components/ui/TimePicker';
import { colors, spacing, font, radius } from '../../../src/theme';
import { todayISO, addDays } from '../../../src/lib/schedule';
import {
  type HabitKind, type ScheduleUnit, type HabitSchedule, type Habit,
} from '../../../src/types/habits';

// Display Monday-first; values are JS getDay() (Sun=0..Sat=6).
const WEEK_DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const UNIT_OPTIONS: { value: ScheduleUnit; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

function parseSchedule(
  unit: ScheduleUnit, intervalStr: string, daysOfWeek: number[], dayOfMonthStr: string, timesOfDay: string[],
): HabitSchedule | { error: string } {
  const interval = parseInt(intervalStr, 10);
  if (!interval || interval < 1) return { error: 'Interval must be at least 1.' };
  if (timesOfDay.length === 0) return { error: 'Add at least one time of day.' };
  if (unit === 'week') {
    if (daysOfWeek.length === 0) return { error: 'Pick at least one weekday.' };
    return { unit, interval, daysOfWeek: daysOfWeek.slice().sort((a, b) => a - b), timesOfDay };
  }
  if (unit === 'month' || unit === 'quarter' || unit === 'year') {
    const dom = parseInt(dayOfMonthStr, 10);
    if (!dom || dom < 1 || dom > 31) return { error: 'Day of month must be between 1 and 31.' };
    return { unit, interval, dayOfMonth: dom, timesOfDay };
  }
  return { unit, interval, timesOfDay };
}

export default function HabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { habits, loaded } = useHabits(user?.uid);

  const isNew = id === 'new';
  const existing = isNew ? undefined : habits.find((h) => h.id === id);

  // Wait for Firestore to load before mounting the form, otherwise the form's
  // initial state captures empty defaults instead of the saved habit values.
  if (!isNew && !loaded) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Header title="Habit" onBack={() => router.back()} />
        <View style={styles.empty}><Text style={styles.emptyText}>Loading…</Text></View>
      </SafeAreaView>
    );
  }
  if (!isNew && !existing) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Header title="Habit" onBack={() => router.back()} />
        <View style={styles.empty}><Text style={styles.emptyText}>Habit not found.</Text></View>
      </SafeAreaView>
    );
  }

  return <HabitForm key={existing?.id ?? 'new'} existing={existing} />;
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

function HabitForm({ existing }: { existing?: Habit }) {
  const router = useRouter();
  const { user } = useAuth();
  const { add, update, setHabitGoal } = useHabits(user?.uid);
  const { goals } = useGoals(user?.uid);
  const { pillars } = usePillars(user?.uid);
  const { goalId: goalIdParam } = useLocalSearchParams<{ goalId?: string }>();
  const [goalId, setGoalId] = useState<string | null>(existing?.goalId ?? goalIdParam ?? null);

  // Open goals in active pillars, in pillar order; the current goal stays listed even if achieved/archived.
  const goalOptions = pillars.flatMap((p) => goals
    .filter((g) => g.pillarId === p.id && (g.id === goalId || (!g.achievedAt && !p.archivedAt)))
    .map((g) => ({ goal: g, pillar: p })));

  const isNew = !existing;

  const [kind, setKind] = useState<HabitKind>(existing?.kind ?? 'continuous');
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayISO());
  const [saving, setSaving] = useState(false);

  const [unit, setUnit] = useState<ScheduleUnit>(existing?.schedule?.unit ?? 'day');
  const [interval, setInterval] = useState(String(existing?.schedule?.interval ?? 1));
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(existing?.schedule?.daysOfWeek ?? []);
  const [dayOfMonth, setDayOfMonth] = useState(String(existing?.schedule?.dayOfMonth ?? 1));
  const [timesOfDay, setTimesOfDay] = useState<string[]>(existing?.schedule?.timesOfDay ?? ['08:00']);

  const [hasTargetSessions, setHasTargetSessions] = useState(existing?.targetSessions != null);
  const [targetSessions, setTargetSessions] = useState(String(existing?.targetSessions ?? 30));
  const [hasTargetDate, setHasTargetDate] = useState(existing?.targetDate != null);
  const [targetDate, setTargetDate] = useState(existing?.targetDate ?? addDays(todayISO(), 30));

  function toggleDay(d: number) {
    setDaysOfWeek((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  async function save() {
    if (!name.trim() || saving) return;

    const schedule = parseSchedule(unit, interval, daysOfWeek, dayOfMonth, timesOfDay);
    if ('error' in schedule) {
      Alert.alert('Invalid schedule', schedule.error);
      return;
    }

    if (kind === 'limited' && !hasTargetSessions && !hasTargetDate) {
      Alert.alert('Missing goal', 'A limited habit needs a target session count and/or a target date.');
      return;
    }
    const sessions = hasTargetSessions ? parseInt(targetSessions, 10) : undefined;
    if (hasTargetSessions && (!sessions || sessions < 1)) {
      Alert.alert('Invalid target', 'Target sessions must be at least 1.');
      return;
    }

    const data: Omit<Habit, 'id' | 'createdAt'> = {
      name: name.trim(),
      description: description.trim() || undefined,
      kind,
      startDate,
      schedule,
      targetSessions: kind === 'limited' && hasTargetSessions ? sessions : undefined,
      targetDate: kind === 'limited' && hasTargetDate ? targetDate : undefined,
    };

    setSaving(true);
    try {
      const habitId = isNew ? await add(data) : (await update(existing!.id, data), existing!.id);
      if (goalId !== (existing?.goalId ?? null)) await setHabitGoal(habitId, goalId);
      router.back();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save habit.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title={isNew ? 'New Habit' : 'Edit Habit'} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Clean the kitchen" />
        <Input label="Description (optional)" value={description} onChangeText={setDescription} placeholder="Notes" />

        <View style={styles.field}>
          <Text style={styles.label}>Serves goal</Text>
          {goalOptions.length === 0 ? (
            <Text style={styles.goalHint}>No open goals yet. Create one in the Goals tab.</Text>
          ) : (
            <View style={styles.goalChips}>
              <Pressable onPress={() => setGoalId(null)} style={[styles.goalChip, goalId === null && styles.goalChipNone]}>
                <Text style={[styles.goalChipText, goalId === null && { color: colors.text }]}>None</Text>
              </Pressable>
              {goalOptions.map(({ goal, pillar }) => {
                const on = goal.id === goalId;
                return (
                  <Pressable
                    key={goal.id}
                    onPress={() => setGoalId(goal.id)}
                    style={[styles.goalChip, on && { borderColor: pillar.color, backgroundColor: `${pillar.color}22` }]}
                  >
                    <View style={[styles.goalDot, { backgroundColor: pillar.color }]} />
                    <Text style={[styles.goalChipText, on && { color: pillar.color }]} numberOfLines={1}>{goal.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Kind</Text>
          <Segmented
            options={[
              { value: 'continuous', label: 'Continuous' },
              { value: 'limited', label: 'Limited' },
            ]}
            value={kind}
            onChange={setKind}
          />
          <Text style={styles.hint}>
            {kind === 'continuous'
              ? 'Open-ended — keeps recurring indefinitely.'
              : 'Has a goal — done once the target is reached.'}
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Frequency</Text>
          <View style={styles.scheduleRow}>
            <Text style={styles.everyText}>Every</Text>
            <Input value={interval} onChangeText={setInterval} keyboardType="numeric" style={styles.intervalInput} />
            <View style={styles.flex1}>
              <Segmented options={UNIT_OPTIONS} value={unit} onChange={setUnit} />
            </View>
          </View>

          {unit === 'week' && (
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
          )}

          {(unit === 'month' || unit === 'quarter' || unit === 'year') && (
            <Input label="Day of month (1–31)" value={dayOfMonth} onChangeText={setDayOfMonth} keyboardType="numeric" />
          )}

          <View style={styles.timesField}>
            <Text style={styles.subLabel}>Times of day</Text>
            {timesOfDay.map((t, i) => (
              <View key={i} style={styles.timeRow}>
                <TimePicker value={t} onChange={(v) => setTimesOfDay((cur) => cur.map((x, idx) => (idx === i ? v : x)))} />
                {timesOfDay.length > 1 && (
                  <Pressable onPress={() => setTimesOfDay((cur) => cur.filter((_, idx) => idx !== i))} hitSlop={8} style={styles.removeTimeBtn}>
                    <Text style={styles.removeTimeBtnText}>✕</Text>
                  </Pressable>
                )}
              </View>
            ))}
            <Pressable onPress={() => setTimesOfDay((cur) => [...cur, '08:00'])} style={styles.addTimeBtn}>
              <Text style={styles.addTimeBtnText}>+ Add time</Text>
            </Pressable>
          </View>
        </View>

        <DatePicker label="Start date" value={startDate} onChange={setStartDate} />

        {kind === 'limited' && (
          <View style={styles.field}>
            <Text style={styles.label}>Goal</Text>

            <Pressable style={styles.toggleRow} onPress={() => setHasTargetSessions((v) => !v)}>
              <View style={[styles.checkbox, hasTargetSessions && styles.checkboxActive]}>
                {hasTargetSessions && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.toggleLabel}>Target number of sessions</Text>
            </Pressable>
            {hasTargetSessions && (
              <Input value={targetSessions} onChangeText={setTargetSessions} keyboardType="numeric" />
            )}

            <Pressable style={styles.toggleRow} onPress={() => setHasTargetDate((v) => !v)}>
              <View style={[styles.checkbox, hasTargetDate && styles.checkboxActive]}>
                {hasTargetDate && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.toggleLabel}>Target end date</Text>
            </Pressable>
            {hasTargetDate && (
              <DatePicker value={targetDate} onChange={setTargetDate} />
            )}
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
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  everyText: { color: colors.textMuted, fontSize: font.md },
  intervalInput: { width: 56, textAlign: 'center' },
  goalHint: { color: colors.textDim, fontSize: font.sm },
  goalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  goalChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  goalChipNone: { borderColor: colors.textMuted },
  goalDot: { width: 8, height: 8, borderRadius: 4 },
  goalChipText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600', flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2,
  },
  checkboxActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkboxMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  toggleLabel: { color: colors.text, fontSize: font.md },
  flex1: { flex: 1 },
  formRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  timesField: { gap: spacing.sm, marginTop: spacing.xs },
  subLabel: { color: colors.textMuted, fontSize: font.sm },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  removeTimeBtn: { padding: spacing.xs },
  removeTimeBtnText: { color: colors.textMuted, fontSize: font.sm },
  addTimeBtn: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  addTimeBtnText: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
});
