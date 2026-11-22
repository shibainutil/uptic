import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useProjects } from '../../src/store/projectStore';
import { useHabits, useHabitLogEntries } from '../../src/store/habitStore';
import {
  useRoutines, useRoutineExecutions, useExerciseExecutions, useRoutineReconcile,
} from '../../src/store/gymStore';
import { buildAgenda, itemCounted, itemDone, type HomeItem } from '../../src/lib/homeAgenda';
import { habitSlotActions } from '../../src/lib/habitSlotActions';
import { ActionBtn, ActionBtnGroup } from '../../src/components/habits/ActionBtn';
import { SectionHeader } from '../../src/components/habits/SectionHeader';
import { slotDateLabel } from '../../src/lib/slotLabel';
import { useNow } from '../../src/hooks/useNow';
import { addDays, fromISO, todayISO } from '../../src/lib/schedule';
import { colors, spacing, font, radius } from '../../src/theme';

const SUCCESS = '#22C55E';
const OVERDUE = '#F97316';
const PAUSE_COLOR = '#EAB308';
const UPCOMING = '#A855F7';

const shortDate = (iso: string) =>
  fromISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function errorAlert(e: unknown) {
  Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const { projects, loaded: projectsLoaded, setTaskDone } = useProjects(user?.uid);
  const { habits, loaded: habitsLoaded, setSkipped, setPauses } = useHabits(user?.uid);
  const { entries, loaded: entriesLoaded, add, update, remove } = useHabitLogEntries(user?.uid);
  const { routines } = useRoutines(user?.uid);
  const { routineExecutions, loaded: routinesLoaded } = useRoutineExecutions(user?.uid);
  const { executions: exerciseExecutions } = useExerciseExecutions(user?.uid);
  // Occurrences are generated lazily; make sure today's and this week's exist even if
  // the Fitness tab hasn't been opened.
  useRoutineReconcile(user?.uid, routines, routineExecutions, exerciseExecutions, routinesLoaded);

  const now = useNow();
  const today = todayISO();
  const yesterday = addDays(today, -1);
  const loaded = projectsLoaded && habitsLoaded && entriesLoaded && routinesLoaded;

  const rawItems = loaded
    ? buildAgenda({ projects, habits, entries, routines, routineExecutions }, yesterday, today, today, now)
    : [];
  // Only keep yesterday's items if they actually need attention
  const items = rawItems.filter((i) =>
    i.date >= today ||
    (i.kind === 'task' && i.overdue) ||
    (i.kind === 'habit' && i.slot.status === 'overdue')
  );
  const counted = items.filter(itemCounted);
  const doneCount = counted.filter(itemDone).length;

  const habitActions = habitSlotActions({ today, habits, entries, setPauses, add, update, remove, setSkipped, onError: errorAlert });
  const actions: RowActions = {
    toggleTask: (i) => { Promise.resolve(setTaskDone(i.projectId, i.milestoneId, i.taskId, !i.done)).catch(errorAlert); },
    openTask: (i) => router.push(`/projects/${i.projectId}`),
    openHabit: (habitId) => router.push(`/habits/entries/${habitId}`),
    openRoutine: (execId) => router.push({ pathname: '/fitness/routine-execution/[id]', params: { id: execId } }),
    ...habitActions,
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>
            {fromISO(today).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          {loaded && counted.length > 0 && (
            <Text style={styles.summarySub}>{doneCount} of {counted.length} done</Text>
          )}
        </View>

        {!loaded ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : (
          <DayView items={items} today={today} actions={actions} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Views ────────────────────────────────────────────────────────────────────

function isOverdue(i: HomeItem, today: string): boolean {
  if (i.kind === 'task') return i.overdue;
  if (i.kind === 'habit') return i.slot.status === 'overdue';
  return false;
}

// Same groups and order as the Habits screen.
const HABIT_GROUPS: { title: string; statuses: string[]; color?: string }[] = [
  { title: 'Overdue', statuses: ['overdue'], color: OVERDUE },
  { title: 'Due', statuses: ['today'], color: colors.accent },
  { title: 'Upcoming', statuses: ['later'], color: UPCOMING },
  { title: 'Paused', statuses: ['paused'], color: PAUSE_COLOR },
  { title: 'Skipped', statuses: ['skipped'], color: colors.danger },
  { title: 'Done', statuses: ['done'], color: SUCCESS },
];

function DayView({ items, today, actions }: { items: HomeItem[]; today: string; actions: RowActions }) {
  const overdueItems = items.filter((i) => i.kind !== 'habit' && isOverdue(i, today));
  const todayItems = items.filter((i) => i.kind !== 'habit' && !isOverdue(i, today) && i.date >= today);
  const habitItems = items.filter((i): i is Extract<HomeItem, { kind: 'habit' }> => i.kind === 'habit');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setClosed((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const sections: { title: string; icon: IconName; kind: HomeItem['kind'] }[] = [
    { title: 'Tasks', icon: 'check-box', kind: 'task' },
    { title: 'Habits', icon: 'track-changes', kind: 'habit' },
    { title: 'Fitness', icon: 'fitness-center', kind: 'routine' },
  ];
  return (
    <>
      {overdueItems.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            label="Overdue" color={OVERDUE} count={overdueItems.length}
            open={!closed.has('top-overdue')} onToggle={() => toggle('top-overdue')}
          />
          {!closed.has('top-overdue') && overdueItems.map((i) => <Row key={i.key} item={i} actions={actions} borderColor={OVERDUE} />)}
        </View>
      )}
      {sections.map((s) => {
        if (s.kind === 'habit') {
          return (
            <View key={s.kind} style={styles.section}>
              <View style={styles.sectionHead}>
                <MaterialIcons name={s.icon} size={16} color={colors.textMuted} />
                <Text style={styles.sectionTitle}>{s.title}</Text>
              </View>
              {habitItems.length === 0 && <Text style={styles.sectionEmpty}>Nothing due</Text>}
              {HABIT_GROUPS.map((g) => {
                const rows = habitItems.filter((i) => g.statuses.includes(i.slot.status));
                if (rows.length === 0) return null;
                return (
                  <View key={g.title} style={styles.section}>
                    <SectionHeader
                      label={g.title} color={g.color} count={rows.length}
                      open={!closed.has(g.title)} onToggle={() => toggle(g.title)}
                    />
                    {!closed.has(g.title) && rows.map((i) => <Row key={i.key} item={i} actions={actions} borderColor={g.color} />)}
                  </View>
                );
              })}
            </View>
          );
        }
        const rows = todayItems.filter((i) => i.kind === s.kind);
        return (
          <View key={s.kind} style={styles.section}>
            <View style={styles.sectionHead}>
              <MaterialIcons name={s.icon} size={16} color={colors.textMuted} />
              <Text style={styles.sectionTitle}>{s.title}</Text>
            </View>
            {rows.length === 0
              ? <Text style={styles.sectionEmpty}>Nothing due</Text>
              : rows.map((i) => <Row key={i.key} item={i} actions={actions} />)}
          </View>
        );
      })}
    </>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

type HabitActions = ReturnType<typeof habitSlotActions>;
type RowActions = HabitActions & {
  toggleTask: (i: Extract<HomeItem, { kind: 'task' }>) => void;
  openTask: (i: Extract<HomeItem, { kind: 'task' }>) => void;
  openHabit: (habitId: string) => void;
  openRoutine: (execId: string) => void;
};

function Row({ item, actions, borderColor }: { item: HomeItem; actions: RowActions; borderColor?: string }) {
  const rowStyle = [styles.row, borderColor ? { borderColor } : null];
  if (item.kind === 'task') {
    return (
      <View style={rowStyle}>
        <Pressable onPress={() => actions.toggleTask(item)} hitSlop={8}>
          <MaterialIcons
            name={item.done ? 'check-box' : 'check-box-outline-blank'}
            size={24}
            color={item.done ? SUCCESS : colors.textMuted}
          />
        </Pressable>
        <Pressable style={styles.rowMain} onPress={() => actions.openTask(item)}>
          <Text style={[styles.rowTitle, item.done && styles.rowTitleDone]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.rowSub, item.overdue && { color: OVERDUE }]} numberOfLines={1}>
            {item.projectName} · {item.milestoneTitle}{item.overdue ? ` · due ${shortDate(item.date)}` : ''}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (item.kind === 'routine') {
    const label = item.status === 'completed' ? 'Completed' : item.status === 'failed' ? 'Missed' : 'Due';
    const tint = item.status === 'completed' ? SUCCESS : item.status === 'failed' ? colors.danger : colors.accent;
    return (
      <Pressable style={rowStyle} onPress={() => actions.openRoutine(item.execId)}>
        <MaterialIcons name="fitness-center" size={24} color={tint} />
        <View style={styles.rowMain}>
          <Text style={[styles.rowTitle, item.status === 'completed' && styles.rowTitleDone]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.rowSub, { color: tint }]}>{label}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
      </Pressable>
    );
  }

  const { slot } = item;
  const tint = slot.status === 'done' ? SUCCESS : slot.status === 'skipped' ? colors.danger : slot.status === 'overdue' ? OVERDUE
    : slot.status === 'paused' ? PAUSE_COLOR : slot.status === 'today' ? colors.accent
    : slot.status === 'later' ? UPCOMING : colors.textMuted;
  const statusText = { done: 'Done', skipped: 'Skipped', overdue: 'Overdue', today: 'Due', later: 'Upcoming', upcoming: '', paused: 'Paused' }[slot.status];
  return (
    <View style={rowStyle}>
      <MaterialIcons
        name={slot.status === 'done' ? 'check-circle' : slot.status === 'skipped' ? 'cancel'
          : slot.status === 'paused' ? 'pause-circle-outline'
          : slot.status === 'overdue' ? 'error-outline' : 'radio-button-unchecked'}
        size={24}
        color={tint}
      />
      <Pressable style={styles.rowMain} onPress={() => actions.openHabit(item.habitId)}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.rowSub, statusText ? { color: tint } : null]} numberOfLines={1}>
          {slotDateLabel(slot)}{statusText ? ` · ${statusText}` : ''}
        </Text>
      </Pressable>
      {slot.status === 'skipped' ? (
        <ActionBtn label="Undo" icon="refresh" scheme="grey" onPress={() => actions.skip(item.habitId, slot, false)} />
      ) : slot.status === 'done' ? (
        <ActionBtn label="Undo" icon="refresh" scheme="grey" onPress={() => actions.undoDone(item.habitId, slot)} />
      ) : slot.status === 'paused' ? (
        <ActionBtn label="Undo" icon="refresh" scheme="grey" onPress={() => actions.undoPause(item.habitId, slot)} />
      ) : (
        <ActionBtnGroup>
          <ActionBtn label="Skip" icon="close" scheme="red" onPress={() => actions.skip(item.habitId, slot, true)} />
          <ActionBtn label="Done" icon="check" scheme="green" onPress={() => actions.markDone(item.habitId, slot)} />
        </ActionBtnGroup>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.lg },
  summary: { gap: 2 },
  summaryTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  summarySub: { color: colors.textMuted, fontSize: font.sm },
  empty: { color: colors.textDim, fontSize: font.md, textAlign: 'center', paddingVertical: spacing.xl },
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sectionTitle: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sectionEmpty: { color: colors.textDim, fontSize: font.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface2,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: font.md },
  rowTitleDone: { color: colors.textDim },
  rowSub: { color: colors.textDim, fontSize: font.sm },
});
