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
import { buildAgenda, itemDone, weekRange, type HomeItem } from '../../src/lib/homeAgenda';
import { habitSlotActions } from '../../src/lib/habitSlotActions';
import { addDays, fromISO, todayISO } from '../../src/lib/schedule';
import { colors, spacing, font, radius } from '../../src/theme';

const SUB_TABS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
] as const;
type SubTab = typeof SUB_TABS[number]['key'];

const SUCCESS = '#22C55E';
const OVERDUE = '#F97316';

const shortDate = (iso: string) =>
  fromISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function errorAlert(e: unknown) {
  Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
}

function dayHeading(iso: string, today: string): string {
  if (iso === today) return `Today · ${shortDate(iso)}`;
  if (iso === addDays(today, 1)) return `Tomorrow · ${shortDate(iso)}`;
  if (iso === addDays(today, -1)) return `Yesterday · ${shortDate(iso)}`;
  return shortDate(iso);
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<SubTab>('day');

  const { projects, loaded: projectsLoaded, setTaskDone } = useProjects(user?.uid);
  const { habits, loaded: habitsLoaded, setSkipped } = useHabits(user?.uid);
  const { entries, loaded: entriesLoaded, add, update, remove } = useHabitLogEntries(user?.uid);
  const { routines } = useRoutines(user?.uid);
  const { routineExecutions, loaded: routinesLoaded } = useRoutineExecutions(user?.uid);
  const { executions: exerciseExecutions } = useExerciseExecutions(user?.uid);
  // Occurrences are generated lazily; make sure today's and this week's exist even if
  // the Fitness tab hasn't been opened.
  useRoutineReconcile(user?.uid, routines, routineExecutions, exerciseExecutions, routinesLoaded);

  const today = todayISO();
  const [monday, sunday] = weekRange(today);
  const [from, to] = tab === 'day' ? [today, today] : [monday, sunday];
  const loaded = projectsLoaded && habitsLoaded && entriesLoaded && routinesLoaded;

  const items = loaded
    ? buildAgenda({ projects, habits, entries, routines, routineExecutions }, from, to, today)
    : [];
  const doneCount = items.filter(itemDone).length;

  const habitActions = habitSlotActions({ today, entries, add, update, remove, setSkipped, onError: errorAlert });
  const actions: RowActions = {
    toggleTask: (i) => { Promise.resolve(setTaskDone(i.projectId, i.milestoneId, i.taskId, !i.done)).catch(errorAlert); },
    openTask: (i) => router.push(`/projects/${i.projectId}`),
    openHabit: (habitId) => router.push(`/habits/entries/${habitId}`),
    openRoutine: (execId) => router.push({ pathname: '/fitness/routine-execution/[id]', params: { id: execId } }),
    ...habitActions,
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.subTabBar}>
        {SUB_TABS.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.subTab, tab === t.key && styles.subTabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.subTabText, tab === t.key && styles.subTabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>
            {tab === 'day'
              ? fromISO(today).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
              : `${fromISO(monday).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${fromISO(sunday).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
          </Text>
          {loaded && items.length > 0 && (
            <Text style={styles.summarySub}>{doneCount} of {items.length} done</Text>
          )}
        </View>

        {!loaded ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : tab === 'day' ? (
          <DayView items={items} actions={actions} />
        ) : (
          <WeekView items={items} today={today} from={from} actions={actions} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Views ────────────────────────────────────────────────────────────────────

function DayView({ items, actions }: { items: HomeItem[]; actions: RowActions }) {
  const sections: { title: string; icon: IconName; kind: HomeItem['kind'] }[] = [
    { title: 'Tasks', icon: 'check-box', kind: 'task' },
    { title: 'Habits', icon: 'track-changes', kind: 'habit' },
    { title: 'Fitness', icon: 'fitness-center', kind: 'routine' },
  ];
  return (
    <>
      {sections.map((s) => {
        const rows = items.filter((i) => i.kind === s.kind);
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

function WeekView({ items, today, from, actions }: {
  items: HomeItem[]; today: string; from: string; actions: RowActions;
}) {
  if (items.length === 0) return <Text style={styles.empty}>Nothing due this week.</Text>;

  // Still-open tasks from before this week first, then one group per day.
  const groups: { key: string; title: string; today?: boolean; rows: HomeItem[] }[] = [];
  const overdue = items.filter((i) => i.date < from);
  if (overdue.length) groups.push({ key: 'overdue', title: 'Overdue', rows: overdue });
  for (const i of items.filter((x) => x.date >= from)) {
    let g = groups.find((x) => x.key === i.date);
    if (!g) { g = { key: i.date, title: dayHeading(i.date, today), today: i.date === today, rows: [] }; groups.push(g); }
    g.rows.push(i);
  }
  return (
    <>
      {groups.map((g) => (
        <View key={g.key} style={styles.section}>
          <Text style={[styles.dayTitle, g.today && styles.dayTitleToday, g.key === 'overdue' && { color: OVERDUE }]}>
            {g.title}
          </Text>
          {g.rows.map((i) => <Row key={i.key} item={i} actions={actions} />)}
        </View>
      ))}
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

function Row({ item, actions }: { item: HomeItem; actions: RowActions }) {
  if (item.kind === 'task') {
    return (
      <View style={styles.row}>
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
      <Pressable style={styles.row} onPress={() => actions.openRoutine(item.execId)}>
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
  const tint = slot.status === 'done' ? SUCCESS : slot.status === 'skipped' ? colors.danger : slot.status === 'overdue' ? OVERDUE : colors.textMuted;
  const statusText = { done: 'Done', skipped: 'Skipped', overdue: 'Overdue', today: 'Due', upcoming: '', paused: 'Paused' }[slot.status];
  return (
    <View style={styles.row}>
      <MaterialIcons
        name={slot.status === 'done' ? 'check-circle' : slot.status === 'skipped' ? 'redo' : 'radio-button-unchecked'}
        size={24}
        color={tint}
      />
      <Pressable style={styles.rowMain} onPress={() => actions.openHabit(item.habitId)}>
        <Text style={[styles.rowTitle, (slot.status === 'done' || slot.status === 'skipped') && styles.rowTitleDone]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.rowSub, statusText ? { color: tint } : null]} numberOfLines={1}>
          {slot.time}{statusText ? ` · ${statusText}` : ''}
        </Text>
      </Pressable>
      {slot.status === 'skipped' ? (
        <Pressable onPress={() => actions.skip(item.habitId, slot, false)} hitSlop={8} style={styles.btn}>
          <Text style={styles.btnText}>Undo skip</Text>
        </Pressable>
      ) : slot.status === 'done' ? (
        <Pressable onPress={() => actions.undoDone(item.habitId, slot)} hitSlop={8} style={styles.btn}>
          <Text style={styles.btnText}>Undo</Text>
        </Pressable>
      ) : (
        <>
          <Pressable onPress={() => actions.skip(item.habitId, slot, true)} hitSlop={8} style={styles.btn}>
            <Text style={styles.btnText}>Skip</Text>
          </Pressable>
          <Pressable onPress={() => actions.markDone(item.habitId, slot)} hitSlop={8} style={[styles.btn, styles.btnPrimary]}>
            <Text style={[styles.btnText, { color: '#fff' }]}>Done</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  subTabBar: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
  },
  subTab: {
    flex: 1, paddingVertical: spacing.md, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  subTabActive: { borderBottomColor: colors.accent },
  subTabText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '500' },
  subTabTextActive: { color: colors.accent },
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
  dayTitle: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  dayTitleToday: { color: colors.accent },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface2,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: font.md },
  rowTitleDone: { color: colors.textDim, textDecorationLine: 'line-through' },
  rowSub: { color: colors.textDim, fontSize: font.sm },
  btn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
});
