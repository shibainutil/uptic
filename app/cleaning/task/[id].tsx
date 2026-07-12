import { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { useCleaningTasks } from '../../../src/store/cleaningStore';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { Segmented } from '../../../src/components/ui/Segmented';
import { DatePicker } from '../../../src/components/ui/DatePicker';
import { colors, spacing, font, radius } from '../../../src/theme';
import { todayISO, addDays } from '../../../src/lib/schedule';
import {
  type CleaningTaskKind, type ScheduleUnit, type CleaningSchedule, type CleaningTask,
} from '../../../src/types/cleaning';

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
];

function parseSchedule(
  unit: ScheduleUnit, intervalStr: string, daysOfWeek: number[], dayOfMonthStr: string,
): CleaningSchedule | { error: string } {
  const interval = parseInt(intervalStr, 10);
  if (!interval || interval < 1) return { error: 'Interval must be at least 1.' };
  if (unit === 'week') {
    if (daysOfWeek.length === 0) return { error: 'Pick at least one weekday.' };
    return { unit, interval, daysOfWeek: daysOfWeek.slice().sort((a, b) => a - b) };
  }
  if (unit === 'month') {
    const dom = parseInt(dayOfMonthStr, 10);
    if (!dom || dom < 1 || dom > 31) return { error: 'Day of month must be between 1 and 31.' };
    return { unit, interval, dayOfMonth: dom };
  }
  return { unit, interval };
}

export default function CleaningTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { tasks, loaded } = useCleaningTasks(user?.uid);

  const isNew = id === 'new';
  const existing = isNew ? undefined : tasks.find((t) => t.id === id);

  // Wait for Firestore to load before mounting the form, otherwise the form's
  // initial state captures empty defaults instead of the saved task values.
  if (!isNew && !loaded) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Header title="Cleaning Task" onBack={() => router.back()} />
        <View style={styles.empty}><Text style={styles.emptyText}>Loading…</Text></View>
      </SafeAreaView>
    );
  }
  if (!isNew && !existing) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Header title="Cleaning Task" onBack={() => router.back()} />
        <View style={styles.empty}><Text style={styles.emptyText}>Task not found.</Text></View>
      </SafeAreaView>
    );
  }

  return <TaskForm key={existing?.id ?? 'new'} existing={existing} />;
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

function ScheduleBuilder({
  title, unit, setUnit, interval, setInterval, daysOfWeek, toggleDay, dayOfMonth, setDayOfMonth,
}: {
  title: string;
  unit: ScheduleUnit; setUnit: (u: ScheduleUnit) => void;
  interval: string; setInterval: (v: string) => void;
  daysOfWeek: number[]; toggleDay: (d: number) => void;
  dayOfMonth: string; setDayOfMonth: (v: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{title}</Text>
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

      {unit === 'month' && (
        <Input label="Day of month (1–31)" value={dayOfMonth} onChangeText={setDayOfMonth} keyboardType="numeric" />
      )}
    </View>
  );
}

function TaskForm({ existing }: { existing?: CleaningTask }) {
  const router = useRouter();
  const { user } = useAuth();
  const { add, update } = useCleaningTasks(user?.uid);

  const isNew = !existing;

  const [kind, setKind] = useState<CleaningTaskKind>(existing?.kind ?? 'periodic');
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayISO());
  const [saving, setSaving] = useState(false);

  const [normalUnit, setNormalUnit] = useState<ScheduleUnit>(existing?.normalSchedule?.unit ?? 'week');
  const [normalInterval, setNormalInterval] = useState(String(existing?.normalSchedule?.interval ?? 1));
  const [normalDaysOfWeek, setNormalDaysOfWeek] = useState<number[]>(existing?.normalSchedule?.daysOfWeek ?? []);
  const [normalDayOfMonth, setNormalDayOfMonth] = useState(String(existing?.normalSchedule?.dayOfMonth ?? 1));

  const [deepEnabled, setDeepEnabled] = useState(Boolean(existing?.deepSchedule));
  const [deepUnit, setDeepUnit] = useState<ScheduleUnit>(existing?.deepSchedule?.unit ?? 'month');
  const [deepInterval, setDeepInterval] = useState(String(existing?.deepSchedule?.interval ?? 1));
  const [deepDaysOfWeek, setDeepDaysOfWeek] = useState<number[]>(existing?.deepSchedule?.daysOfWeek ?? []);
  const [deepDayOfMonth, setDeepDayOfMonth] = useState(String(existing?.deepSchedule?.dayOfMonth ?? 1));

  const [targetSessions, setTargetSessions] = useState(String(existing?.targetSessions ?? 3));
  const [targetDate, setTargetDate] = useState(existing?.targetDate ?? addDays(todayISO(), 30));

  function toggleNormalDay(d: number) {
    setNormalDaysOfWeek((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }
  function toggleDeepDay(d: number) {
    setDeepDaysOfWeek((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  async function save() {
    if (!name.trim() || saving) return;

    let data: Omit<CleaningTask, 'id' | 'createdAt'>;

    if (kind === 'periodic') {
      const normalSchedule = parseSchedule(normalUnit, normalInterval, normalDaysOfWeek, normalDayOfMonth);
      if ('error' in normalSchedule) {
        Alert.alert('Invalid schedule', normalSchedule.error);
        return;
      }
      let deepSchedule: CleaningSchedule | undefined;
      if (deepEnabled) {
        const parsed = parseSchedule(deepUnit, deepInterval, deepDaysOfWeek, deepDayOfMonth);
        if ('error' in parsed) {
          Alert.alert('Invalid deep-clean schedule', parsed.error);
          return;
        }
        deepSchedule = parsed;
      }
      data = {
        name: name.trim(),
        description: description.trim() || undefined,
        kind,
        startDate,
        normalSchedule,
        deepSchedule,
      };
    } else {
      const sessions = parseInt(targetSessions, 10);
      if (!sessions || sessions < 1) {
        Alert.alert('Invalid target', 'Target sessions must be at least 1.');
        return;
      }
      data = {
        name: name.trim(),
        description: description.trim() || undefined,
        kind,
        startDate,
        targetSessions: sessions,
        targetDate,
      };
    }

    setSaving(true);
    try {
      if (isNew) {
        await add(data);
      } else {
        await update(existing!.id, data);
      }
      router.back();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save task.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title={isNew ? 'New Cleaning Task' : 'Edit Cleaning Task'} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Bathroom" />
        <Input label="Description (optional)" value={description} onChangeText={setDescription} placeholder="Notes" />

        <View style={styles.field}>
          <Text style={styles.label}>Kind</Text>
          <Segmented
            options={[
              { value: 'periodic', label: 'Periodic' },
              { value: 'finite', label: 'Finite' },
            ]}
            value={kind}
            onChange={setKind}
          />
        </View>

        {kind === 'periodic' ? (
          <>
            <ScheduleBuilder
              title="Normal clean"
              unit={normalUnit} setUnit={setNormalUnit}
              interval={normalInterval} setInterval={setNormalInterval}
              daysOfWeek={normalDaysOfWeek} toggleDay={toggleNormalDay}
              dayOfMonth={normalDayOfMonth} setDayOfMonth={setNormalDayOfMonth}
            />

            <Pressable style={styles.toggleRow} onPress={() => setDeepEnabled((v) => !v)}>
              <View style={[styles.checkbox, deepEnabled && styles.checkboxActive]}>
                {deepEnabled && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.toggleLabel}>Track a separate deep clean</Text>
            </Pressable>

            {deepEnabled && (
              <ScheduleBuilder
                title="Deep clean"
                unit={deepUnit} setUnit={setDeepUnit}
                interval={deepInterval} setInterval={setDeepInterval}
                daysOfWeek={deepDaysOfWeek} toggleDay={toggleDeepDay}
                dayOfMonth={deepDayOfMonth} setDayOfMonth={setDeepDayOfMonth}
              />
            )}

            <DatePicker label="Start date" value={startDate} onChange={setStartDate} />
          </>
        ) : (
          <>
            <Input
              label="Target sessions"
              value={targetSessions}
              onChangeText={setTargetSessions}
              keyboardType="numeric"
            />
            <DatePicker label="Start date" value={startDate} onChange={setStartDate} />
            <DatePicker label="Target date" value={targetDate} onChange={setTargetDate} />
            <Text style={styles.hint}>
              Sessions are spaced evenly between the start and target dates.
            </Text>
          </>
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
});
