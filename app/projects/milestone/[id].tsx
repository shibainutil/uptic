import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, TextInput } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useProjects } from '../../../src/store/projectStore';
import { useHabits, useHabitLogEntries } from '../../../src/store/habitStore';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { DatePicker } from '../../../src/components/ui/DatePicker';
import { Toggle } from '../../../src/components/ui/Toggle';
import { Segmented } from '../../../src/components/ui/Segmented';
import { formatShortDate } from '../../../src/components/projects/ProjectCard';
import { takePendingHabitLink } from '../../../src/lib/pendingHabitLink';
import { habitTargetProgress } from '../../../src/lib/projectProgress';
import { describeSchedule } from '../../../src/lib/habitSchedule';
import { addDays, todayISO } from '../../../src/lib/schedule';
import {
  DEFAULT_TARGET_COUNT, DEFAULT_TARGET_RATE, DEFAULT_WINDOW_WEEKS, newId,
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

/** Editable copy of a habit target; numbers are strings while typing. */
interface HabitDraft {
  id: string;
  habitId: string;
  mode: 'count' | 'rate';
  count: string;
  since: string;
  rate: string;
  weeks: string;
  original?: HabitCriterion;
}

type TargetMode = HabitDraft['mode'];
const MODE_OPTIONS: { value: TargetMode; label: string }[] = [
  { value: 'count', label: 'Sessions' },
  { value: 'rate', label: 'Success rate' },
];

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
      id: c.id,
      habitId: c.habitId,
      mode: c.targetCount != null ? 'count' as const : 'rate' as const,
      count: String(c.targetCount ?? DEFAULT_TARGET_COUNT),
      since: c.since ?? today,
      rate: String(c.targetRate),
      weeks: String(c.windowWeeks),
      original: c,
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

  /**
   * Link a habit. A habit with a session goal (limited) starts as a session-count
   * target counted from its start date; others start as a success-rate target.
   */
  function addTarget(habitId: string, startDate?: string, targetSessions?: number) {
    const habit = habits.find((h) => h.id === habitId);
    const sessions = targetSessions ?? habit?.targetSessions;
    const start = startDate ?? habit?.startDate ?? today;
    setTargets((cur) => (cur.some((t) => t.habitId === habitId) ? cur : [...cur, {
      id: newId(),
      habitId,
      mode: sessions != null ? 'count' : 'rate',
      count: String(sessions ?? DEFAULT_TARGET_COUNT),
      // A habit with a session goal counts from its start; others from today.
      since: sessions != null || start > today ? start : today,
      rate: String(DEFAULT_TARGET_RATE),
      weeks: String(DEFAULT_WINDOW_WEEKS),
    }]));
    setPickingHabit(false);
  }

  // Coming back from "Create new habit": link the habit that was just created.
  useFocusEffect(useCallback(() => {
    const link = takePendingHabitLink();
    if (link) addTarget(link.habitId, link.startDate, link.targetSessions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  function createHabit() {
    setPickingHabit(false);
    router.push({ pathname: '/habits/habit/[id]', params: { id: 'new', link: '1' } });
  }

  const patchTarget = (tid: string, patch: Partial<HabitDraft>) =>
    setTargets((cur) => cur.map((t) => (t.id === tid ? { ...t, ...patch } : t)));

  function buildTargets(): HabitCriterion[] | string {
    const out: HabitCriterion[] = [];
    for (const t of targets) {
      const o = t.original;
      if (t.mode === 'count') {
        const count = parseInt(t.count, 10);
        if (!count || count < 1 || count > 1000) return 'Each session target needs 1–1000 sessions.';
        // Raising the bar (or switching habit) means it has to be reached again.
        const unchanged = o && o.habitId === t.habitId && o.targetCount === count && o.since === t.since;
        out.push({
          kind: 'habit', id: t.id, habitId: t.habitId, targetCount: count, since: t.since,
          targetRate: o?.targetRate ?? DEFAULT_TARGET_RATE, windowWeeks: o?.windowWeeks ?? DEFAULT_WINDOW_WEEKS,
          metAt: unchanged ? o.metAt : undefined,
        });
        continue;
      }
      const rate = parseInt(t.rate, 10);
      const weeks = parseInt(t.weeks, 10);
      if (!rate || rate < 1 || rate > 100) return 'Each habit target needs a rate between 1 and 100 %.';
      if (!weeks || weeks < 1 || weeks > 52) return 'Each habit target needs a window of 1–52 weeks.';
      const unchanged = o && o.targetCount == null && o.habitId === t.habitId
        && o.targetRate === rate && o.windowWeeks === weeks;
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
            Sessions: met once that many sessions are logged; skipped sessions are made up by later ones.
            Success rate: met once the habit hits the rate over the window.
          </Text>
          {targets.map((t) => {
            const habit = habits.find((h) => h.id === t.habitId);
            const criterion: HabitCriterion = t.mode === 'count'
              ? {
                kind: 'habit', id: t.id, habitId: t.habitId, targetCount: parseInt(t.count, 10) || DEFAULT_TARGET_COUNT,
                since: t.since, targetRate: DEFAULT_TARGET_RATE, windowWeeks: DEFAULT_WINDOW_WEEKS,
              }
              : {
                kind: 'habit', id: t.id, habitId: t.habitId,
                targetRate: parseInt(t.rate, 10) || DEFAULT_TARGET_RATE,
                windowWeeks: parseInt(t.weeks, 10) || DEFAULT_WINDOW_WEEKS,
              };
            const p = habitTargetProgress(criterion, habits, entries, today);
            let preview: string;
            if (!habit) preview = 'Habit no longer exists';
            else if (t.mode === 'count') {
              preview = `${p.completed} of ${p.expected} done`
                + (p.reachedNow ? ' · target reached' : p.finishDate ? ` · last session ${formatShortDate(p.finishDate)}` : '');
            } else {
              preview = !p.covered ? `Counts in ${p.daysUntilCovered} days · now ${Math.round(p.rate * 100)}%`
                : `Now ${Math.round(p.rate * 100)}% (${p.completed}/${p.expected})${p.reachedNow ? ' · target reached' : ''}`;
            }
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
                <Segmented options={MODE_OPTIONS} value={t.mode} onChange={(mode) => patchTarget(t.id, { mode })} />
                {t.mode === 'count' ? (
                  <>
                    <View style={styles.targetInputs}>
                      <Text style={styles.targetWord}>Complete</Text>
                      <TextInput
                        value={t.count}
                        onChangeText={(v) => patchTarget(t.id, { count: v })}
                        keyboardType="number-pad"
                        style={styles.numInput}
                      />
                      <Text style={styles.targetWord}>sessions, counting from</Text>
                    </View>
                    <DatePicker value={t.since} onChange={(since) => patchTarget(t.id, { since })} />
                  </>
                ) : (
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
                )}
                <Text style={[styles.targetPreview, p.reachedNow && { color: colors.success }]}>{preview}</Text>
              </View>
            );
          })}

          {pickingHabit ? (
            <View style={styles.picker}>
              <Pressable style={styles.pickRow} onPress={createHabit}>
                <View style={styles.flex1}>
                  <Text style={[styles.targetName, { color: colors.accent }]}>Create new habit</Text>
                  <Text style={styles.targetMeta}>Pick its days and number of sessions, then it is linked here</Text>
                </View>
                <MaterialIcons name="add-circle-outline" size={20} color={colors.accent} />
              </Pressable>
              {available.map((h) => (
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
