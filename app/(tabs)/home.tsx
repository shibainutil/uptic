import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../src/store/habitStore';
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

function errorAlert(e: unknown) {
  Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const { habits, loaded: habitsLoaded, setSkipped, setPauses } = useHabits(user?.uid);
  const { entries, loaded: entriesLoaded, add, update, remove } = useHabitLogEntries(user?.uid);

  const now = useNow();
  const today = todayISO();
  const yesterday = addDays(today, -1);
  const loaded = habitsLoaded && entriesLoaded;

  // Home shows habits only.
  const rawItems = loaded
    ? buildAgenda({ projects: [], habits, entries, routines: [], routineExecutions: [] }, yesterday, today, today, now)
    : [];
  // Only keep yesterday's sessions if they still need attention.
  const items = rawItems.filter((i): i is HabitItem =>
    i.kind === 'habit' && (i.date >= today || i.slot.status === 'overdue'));
  const counted = items.filter(itemCounted);
  const doneCount = counted.filter(itemDone).length;

  const habitActions = habitSlotActions({ today, habits, entries, setPauses, add, update, remove, setSkipped, onError: errorAlert });
  const actions: RowActions = {
    openHabit: (habitId) => router.push(`/habits/entries/${habitId}`),
    ...habitActions,
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>
            {fromISO(today).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          {loaded && items.length > 0 && <ProgressDots items={items} doneCount={doneCount} counted={counted.length} />}
        </View>

        {!loaded ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : (
          <DayView items={items} actions={actions} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Views ────────────────────────────────────────────────────────────────────

type DotStatus = 'done' | 'skipped' | 'paused' | 'overdue' | 'due' | 'upcoming';

// Same order as the status groups on the Habits screen (HABIT_GROUPS).
const DOT_ORDER: DotStatus[] = ['overdue', 'due', 'upcoming', 'paused', 'skipped', 'done'];
const DOT_COLOR: Record<DotStatus, string> = {
  done: SUCCESS, skipped: colors.danger, paused: PAUSE_COLOR, overdue: OVERDUE, due: colors.accent, upcoming: UPCOMING,
};

function dotStatus(i: HabitItem): DotStatus {
  switch (i.slot.status) {
    case 'done': return 'done';
    case 'skipped': return 'skipped';
    case 'paused': return 'paused';
    case 'overdue': return 'overdue';
    case 'later': case 'upcoming': return 'upcoming';
    default: return 'due';
  }
}

/** One dot per item on today's agenda (paused ones too), coloured like the Habits screen's status groups. */
function ProgressDots({ items, doneCount, counted }: { items: HabitItem[]; doneCount: number; counted: number }) {
  const dots = items.map(dotStatus).sort((a, b) => DOT_ORDER.indexOf(a) - DOT_ORDER.indexOf(b));
  return (
    <View style={styles.dots} accessible accessibilityLabel={`${doneCount} of ${counted} done`}>
      {dots.map((d, n) => <View key={n} style={[styles.dot, { backgroundColor: DOT_COLOR[d] }]} />)}
    </View>
  );
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

function DayView({ items, actions }: { items: HabitItem[]; actions: RowActions }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setClosed((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  if (items.length === 0) return <Text style={styles.sectionEmpty}>Nothing due</Text>;
  return (
    <>
      {HABIT_GROUPS.map((g) => {
        const rows = items.filter((i) => g.statuses.includes(i.slot.status));
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
    </>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

type HabitItem = Extract<HomeItem, { kind: 'habit' }>;
type HabitActions = ReturnType<typeof habitSlotActions>;
type RowActions = HabitActions & { openHabit: (habitId: string) => void };

function Row({ item, actions, borderColor }: { item: HabitItem; actions: RowActions; borderColor?: string }) {
  const rowStyle = [styles.row, borderColor ? { borderColor } : null];
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
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  empty: { color: colors.textDim, fontSize: font.md, textAlign: 'center', paddingVertical: spacing.xl },
  section: { gap: spacing.sm },
  sectionEmpty: { color: colors.textDim, fontSize: font.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface2,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: font.md },
  rowSub: { color: colors.textDim, fontSize: font.sm },
});
