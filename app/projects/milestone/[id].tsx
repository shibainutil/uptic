import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useProjects } from '../../../src/store/projectStore';
import { useHabits, useHabitLogEntries } from '../../../src/store/habitStore';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { DatePicker } from '../../../src/components/ui/DatePicker';
import { Toggle } from '../../../src/components/ui/Toggle';
import { habitTargetProgress } from '../../../src/lib/projectProgress';
import { describeSchedule } from '../../../src/lib/habitSchedule';
import { addDays, todayISO } from '../../../src/lib/schedule';
import {
  DEFAULT_TARGET_RATE, DEFAULT_WINDOW_WEEKS, newId,
  type Criterion, type HabitCriterion, type Milestone, type TaskCriterion,
} from '../../../src/types/projects';
import type { Habit, HabitLogEntry } from '../../../src/types/habits';
import { colors, spacing, font, radius } from '../../../src/theme';

export default function MilestoneScreen() {
  const { id, projectId } = useLocalSearchParams<{ id: string; projectId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { projects, loaded, saveMilestone } = useProjects(user?.uid);
  const { habits, loaded: habitsLoaded } = useHabits(user?.uid);
  const { entries } = useHabitLogEntries(user?.uid);

  const project = projects.find((p) => p.id === projectId);
  const isNew = id === 'new';
  const existing = isNew ? undefined : project?.milestones.find((m) => m.id === id);

  if (!loaded || !habitsLoaded || !project || (!isNew && !existing)) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Header title="Milestone" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{loaded && habitsLoaded ? 'Milestone not found.' : 'Loading…'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <MilestoneForm
      key={existing?.id ?? 'new'}
      projectId={project.id}
      projectName={project.name}
      existing={existing}
      habits={habits}
      entries={entries}
      save={saveMilestone}
    />
  );
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

/** Editable copy of a habit target; rate/weeks are strings while typing. */
interface HabitDraft { id: string; habitId: string; rate: string; weeks: string; original?: HabitCriterion }

function MilestoneForm({
  projectId, projectName, existing, habits, entries, save,
}: {
  projectId: string;
  projectName: string;
  existing?: Milestone;
  habits: Habit[];
  entries: HabitLogEntry[];
  save: ReturnType<typeof useProjects>['saveMilestone'];
}) {
  const router = useRouter();
  const isNew = !existing;
  const today = todayISO();

  const [title, setTitle] = useState(existing?.title ?? '');
  const [hasDue, setHasDue] = useState(!!existing?.dueDate);
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? addDays(today, 30));
  const [tasks, setTasks] = useState<TaskCriterion[]>(
    existing?.criteria.filter((c): c is TaskCriterion => c.kind === 'task') ?? [],
  );
  const [targets, setTargets] = useState<HabitDraft[]>(
    (existing?.criteria.filter((c): c is HabitCriterion => c.kind === 'habit') ?? []).map((c) => ({
      id: c.id, habitId: c.habitId, rate: String(c.targetRate), weeks: String(c.windowWeeks), original: c,
    })),
  );
  const [newTask, setNewTask] = useState('');
  const [pickingHabit, setPickingHabit] = useState(false);
  const [saving, setSaving] = useState(false);

  function addTask() {
    const t = newTask.trim();
    if (!t) return;
    setTasks((cur) => [...cur, { kind: 'task', id: newId(), title: t }]);
    setNewTask('');
  }

  function addTarget(habitId: string) {
    setTargets((cur) => [...cur, {
      id: newId(), habitId, rate: String(DEFAULT_TARGET_RATE), weeks: String(DEFAULT_WINDOW_WEEKS),
    }]);
    setPickingHabit(false);
  }

  const patchTarget = (tid: string, patch: Partial<HabitDraft>) =>
    setTargets((cur) => cur.map((t) => (t.id === tid ? { ...t, ...patch } : t)));

  function buildTargets(): HabitCriterion[] | string {
    const out: HabitCriterion[] = [];
    for (const t of targets) {
      const rate = parseInt(t.rate, 10);
      const weeks = parseInt(t.weeks, 10);
      if (!rate || rate < 1 || rate > 100) return 'Each habit target needs a rate between 1 and 100 %.';
      if (!weeks || weeks < 1 || weeks > 52) return 'Each habit target needs a window of 1–52 weeks.';
      const o = t.original;
      // Raising the bar (or switching habit) means it has to be reached again.
      const unchanged = o && o.habitId === t.habitId && o.targetRate === rate && o.windowWeeks === weeks;
      out.push({ kind: 'habit', id: t.id, habitId: t.habitId, targetRate: rate, windowWeeks: weeks, metAt: unchanged ? o.metAt : undefined });
    }
    return out;
  }

  async function submit() {
    if (!title.trim() || saving) return;
    const habitCriteria = buildTargets();
    if (typeof habitCriteria === 'string') { Alert.alert('Check the habit targets', habitCriteria); return; }
    const pending = newTask.trim();
    const allTasks = pending ? [...tasks, { kind: 'task' as const, id: newId(), title: pending }] : tasks;
    const criteria: Criterion[] = [...allTasks, ...habitCriteria];
    const milestone: Milestone = {
      id: existing?.id ?? newId(),
      title: title.trim(),
      dueDate: hasDue ? dueDate : undefined,
      criteria,
    };
    setSaving(true);
    try {
      await save(projectId, milestone);
      router.back();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save milestone.');
      setSaving(false);
    }
  }

  const usedHabitIds = new Set(targets.map((t) => t.habitId));
  const available = habits.filter((h) => !usedHabitIds.has(h.id));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title={isNew ? 'New Milestone' : 'Edit Milestone'} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.context} numberOfLines={1}>{projectName}</Text>

        <Input label="Milestone" value={title} onChangeText={setTitle} placeholder="e.g. Floor is done" />

        <View style={styles.field}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Due date</Text>
            <Toggle value={hasDue} onChange={setHasDue} />
          </View>
          {hasDue && <DatePicker value={dueDate} onChange={setDueDate} />}
        </View>

        {/* Tasks */}
        <View style={styles.field}>
          <Text style={styles.label}>Tasks</Text>
          {tasks.map((t) => (
            <View key={t.id} style={styles.taskRow}>
              <MaterialIcons
                name={t.doneAt ? 'check-box' : 'check-box-outline-blank'}
                size={20}
                color={t.doneAt ? colors.success : colors.textDim}
              />
              <TextInput
                value={t.title}
                onChangeText={(v) => setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, title: v } : x)))}
                style={styles.taskInput}
                placeholderTextColor={colors.textDim}
              />
              <Pressable onPress={() => setTasks((cur) => cur.filter((x) => x.id !== t.id))} hitSlop={8}>
                <MaterialIcons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
          <View style={styles.taskRow}>
            <MaterialIcons name="add" size={20} color={colors.accent} />
            <TextInput
              value={newTask}
              onChangeText={setNewTask}
              onSubmitEditing={addTask}
              placeholder="Add a task"
              placeholderTextColor={colors.textDim}
              returnKeyType="done"
              blurOnSubmit={false}
              style={styles.taskInput}
            />
            {newTask.trim() ? (
              <Pressable onPress={addTask} hitSlop={8}><Text style={styles.addText}>Add</Text></Pressable>
            ) : null}
          </View>
        </View>

        {/* Habit targets */}
        <View style={styles.field}>
          <Text style={styles.label}>Habit targets</Text>
          <Text style={styles.hint}>
            Met once the habit hits its success rate over the window. It only counts once the habit has existed for the whole window.
          </Text>
          {targets.map((t) => {
            const habit = habits.find((h) => h.id === t.habitId);
            const rate = parseInt(t.rate, 10) || DEFAULT_TARGET_RATE;
            const weeks = parseInt(t.weeks, 10) || DEFAULT_WINDOW_WEEKS;
            const p = habitTargetProgress(
              { kind: 'habit', id: t.id, habitId: t.habitId, targetRate: rate, windowWeeks: weeks }, habits, entries, today,
            );
            const preview = !habit ? 'Habit no longer exists'
              : !p.covered ? `Counts in ${p.daysUntilCovered} days · now ${Math.round(p.rate * 100)}%`
                : `Now ${Math.round(p.rate * 100)}% (${p.completed}/${p.expected})${p.reachedNow ? ' · target reached' : ''}`;
            return (
              <View key={t.id} style={styles.targetCard}>
                <View style={styles.targetHead}>
                  <View style={styles.flex1}>
                    <Text style={styles.targetName}>{habit?.name ?? 'Deleted habit'}</Text>
                    {habit && <Text style={styles.targetMeta} numberOfLines={1}>{describeSchedule(habit.schedule)}</Text>}
                  </View>
                  <Pressable onPress={() => setTargets((cur) => cur.filter((x) => x.id !== t.id))} hitSlop={8}>
                    <MaterialIcons name="close" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
                <View style={styles.targetInputs}>
                  <Text style={styles.targetWord}>≥</Text>
                  <TextInput
                    value={t.rate}
                    onChangeText={(v) => patchTarget(t.id, { rate: v })}
                    keyboardType="number-pad"
                    style={styles.numInput}
                  />
                  <Text style={styles.targetWord}>% over</Text>
                  <TextInput
                    value={t.weeks}
                    onChangeText={(v) => patchTarget(t.id, { weeks: v })}
                    keyboardType="number-pad"
                    style={styles.numInput}
                  />
                  <Text style={styles.targetWord}>weeks</Text>
                </View>
                <Text style={[styles.targetPreview, p.reachedNow && { color: colors.success }]}>{preview}</Text>
              </View>
            );
          })}

          {pickingHabit ? (
            <View style={styles.picker}>
              {available.length === 0 ? (
                <Text style={styles.hint}>
                  {habits.length === 0 ? 'No habits yet. Create one in the Habits tab first.' : 'Every habit already has a target here.'}
                </Text>
              ) : available.map((h) => (
                <Pressable key={h.id} style={styles.pickRow} onPress={() => addTarget(h.id)}>
                  <View style={styles.flex1}>
                    <Text style={styles.targetName}>{h.name}</Text>
                    <Text style={styles.targetMeta} numberOfLines={1}>{describeSchedule(h.schedule)}</Text>
                  </View>
                  <MaterialIcons name="add" size={20} color={colors.accent} />
                </Pressable>
              ))}
              <Pressable onPress={() => setPickingHabit(false)} hitSlop={8} style={styles.pickCancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.addTarget} onPress={() => setPickingHabit(true)}>
              <MaterialIcons name="add" size={20} color={colors.accent} />
              <Text style={styles.addText}>Add habit target</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.formRow}>
          <Button label="Cancel" onPress={() => router.back()} style={styles.flex1} disabled={saving} />
          <Button
            label={isNew ? 'Add' : 'Save'}
            variant="primary"
            onPress={submit}
            disabled={!title.trim() || saving}
            style={styles.flex1}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
  },
  back: { width: 48 },
  backText: { color: colors.accent, fontSize: font.md },
  headerTitle: { flex: 1, color: colors.text, fontSize: font.lg, fontWeight: '600', textAlign: 'center' },
  body: { padding: spacing.lg, gap: spacing.lg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textDim, fontSize: font.md },
  context: { color: colors.textMuted, fontSize: font.sm },
  field: { gap: spacing.sm },
  label: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  hint: { color: colors.textDim, fontSize: font.sm, lineHeight: 18 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { color: colors.text, fontSize: font.md },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  taskInput: { flex: 1, color: colors.text, fontSize: font.md, paddingVertical: 10 },
  addText: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
  targetCard: {
    backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface2,
    padding: spacing.md, gap: spacing.sm,
  },
  targetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  targetName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  targetMeta: { color: colors.textDim, fontSize: font.sm },
  targetInputs: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  targetWord: { color: colors.textMuted, fontSize: font.md },
  numInput: {
    width: 56, textAlign: 'center', color: colors.text, fontSize: font.md,
    backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingVertical: 6,
  },
  targetPreview: { color: colors.textMuted, fontSize: font.sm },
  picker: {
    gap: spacing.xs, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  pickCancel: { alignSelf: 'center', padding: spacing.sm },
  cancelText: { color: colors.textMuted, fontSize: font.sm },
  addTarget: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  formRow: { flexDirection: 'row', gap: spacing.md },
});
