import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import {
  NestableScrollContainer, NestableDraggableFlatList, ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { useAuth } from '../../src/context/AuthContext';
import { usePillars } from '../../src/store/pillarStore';
import { useGoals } from '../../src/store/goalStore';
import { useHabits, useHabitLogEntries } from '../../src/store/habitStore';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { DragHandle } from '../../src/components/ui/DragHandle';
import { describeGoalTarget, goalStatus, type Goal, type GoalStatus } from '../../src/types/goals';
import type { Pillar } from '../../src/types/pillars';
import type { Habit, HabitLogEntry } from '../../src/types/habits';
import { computeMaintenanceProgress } from '../../src/lib/habitSchedule';
import { todayISO } from '../../src/lib/schedule';
import { colors, spacing, font, radius } from '../../src/theme';

const STATUS_BADGE: Record<Exclude<GoalStatus, 'ongoing'>, { label: string; color: string }> = {
  active:   { label: 'Active',   color: colors.accent },
  overdue:  { label: 'Overdue',  color: colors.danger },
  achieved: { label: 'Achieved', color: colors.success },
};
const SLIPPING = '#F97316';

export default function GoalsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { pillars, loaded: pillarsLoaded } = usePillars(user?.uid);
  const { goals, loaded: goalsLoaded, reorder } = useGoals(user?.uid);
  const { habits } = useHabits(user?.uid);
  const { entries } = useHabitLogEntries(user?.uid);
  const loaded = pillarsLoaded && goalsLoaded;
  const today = todayISO();

  const activePillars = pillars.filter((p) => !p.archivedAt);
  const visibleGoals = goals.filter((g) => activePillars.some((p) => p.id === g.pillarId));
  const openCount = visibleGoals.filter((g) => !g.achievedAt).length;

  if (loaded && activePillars.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.empty}>
          <MaterialIcons name="flag" size={48} color={colors.textDim} />
          <Text style={styles.emptyTitle}>Set up pillars first</Text>
          <Text style={styles.emptyText}>Every goal belongs to a pillar,{'\n'}a big area of your life.</Text>
          <Button label="Go to Pillars" variant="primary" onPress={() => router.navigate('/(tabs)/pillars')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.count}>{openCount} open goal{openCount !== 1 ? 's' : ''}</Text>
        <Pressable onPress={() => router.push('/goals/new')} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      <NestableScrollContainer contentContainerStyle={styles.list}>
        {activePillars.map((pillar) => (
          <PillarSection
            key={pillar.id}
            pillar={pillar}
            goals={goals.filter((g) => g.pillarId === pillar.id)}
            habits={habits}
            entries={entries}
            today={today}
            onReorder={reorder}
            onOpen={(id) => router.push(`/goals/${id}`)}
            onAdd={() => router.push({ pathname: '/goals/[id]', params: { id: 'new', pillarId: pillar.id } })}
          />
        ))}
      </NestableScrollContainer>
    </SafeAreaView>
  );
}

function PillarSection({
  pillar, goals, habits, entries, today, onReorder, onOpen, onAdd,
}: {
  pillar: Pillar;
  goals: Goal[];
  habits: Habit[];
  entries: HabitLogEntry[];
  today: string;
  onReorder: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const open = goals.filter((g) => !g.achievedAt);
  const achieved = goals.filter((g) => g.achievedAt);

  // Show the dropped order immediately; Firestore's snapshot catches up a moment later.
  const [dragOrder, setDragOrder] = useState<Goal[] | null>(null);
  useEffect(() => setDragOrder(null), [goals]);

  const card = (goal: Goal, drag?: () => void, isActive?: boolean) => (
    <GoalCard
      goal={goal}
      color={pillar.color}
      habits={habits}
      entries={entries}
      today={today}
      onPress={() => onOpen(goal.id)}
      onDrag={open.length > 1 ? drag : undefined}
      dragging={isActive}
    />
  );

  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <View style={[styles.pillarIcon, { backgroundColor: `${pillar.color}22` }]}>
          <MaterialIcons name={pillar.icon} size={16} color={pillar.color} />
        </View>
        <Text style={[styles.sectionTitle, { color: pillar.color }]}>{pillar.name}</Text>
        <Pressable onPress={onAdd} hitSlop={8} style={styles.sectionAdd}>
          <MaterialIcons name="add" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
      {goals.length === 0 && <Text style={styles.sectionEmpty}>No goals yet</Text>}

      <NestableDraggableFlatList
        data={dragOrder ?? open}
        keyExtractor={(item) => item.id}
        activationDistance={10}
        onDragEnd={({ data }) => { setDragOrder(data); onReorder(data.map((g) => g.id)); }}
        renderItem={({ item, drag, isActive }) => (
          <ScaleDecorator activeScale={1.03}>{card(item, drag, isActive)}</ScaleDecorator>
        )}
      />
      {achieved.map((g) => <View key={g.id}>{card(g)}</View>)}
    </View>
  );
}

function GoalCard({
  goal, color, habits, entries, today, onPress, onDrag, dragging,
}: {
  goal: Goal;
  color: string;
  habits: Habit[];
  entries: HabitLogEntry[];
  today: string;
  onPress: () => void;
  onDrag?: () => void;
  dragging?: boolean;
}) {
  const status = goalStatus(goal, today);
  const achieved = status === 'achieved';
  const linked = habits.filter((h) => h.goalId === goal.id).length;

  let badge: { label: string; color: string };
  let detail = describeGoalTarget(goal);
  if (status === 'ongoing') {
    const p = computeMaintenanceProgress(goal, habits, entries, today);
    const pct = `${Math.round(p.rate * 100)}%`;
    badge = p.health === 'onTrack' ? { label: `On track ${pct}`, color: colors.success }
      : p.health === 'slipping' ? { label: `Slipping ${pct}`, color: SLIPPING }
      : { label: linked ? 'No data yet' : 'No habits', color: colors.textMuted };
    detail = `Target ${detail}`;
  } else {
    badge = STATUS_BADGE[status];
  }
  if (linked) detail += ` · ${linked} habit${linked !== 1 ? 's' : ''}`;

  return (
    <Pressable
      style={[styles.card, { borderLeftColor: color }, achieved && styles.cardAchieved, dragging && styles.cardDragging]}
      onPress={onPress}
      onLongPress={onDrag}
      delayLongPress={250}
      disabled={dragging}
    >
      <View style={styles.cardMain}>
        <Text style={[styles.cardName, achieved && styles.cardNameAchieved]} numberOfLines={2}>{goal.name}</Text>
        <View style={styles.cardMeta}>
          <Badge label={badge.label} color={badge.color} />
          <Text style={styles.cardTarget} numberOfLines={1}>{detail}</Text>
        </View>
      </View>
      {onDrag && <DragHandle onPress={onPress} onDrag={onDrag} active={dragging} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  count: { color: colors.textMuted, fontSize: font.sm },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  addBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: font.lg, fontWeight: '600' },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  list: { padding: spacing.lg, paddingTop: spacing.sm },
  section: { paddingTop: spacing.lg },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  pillarIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: font.md, fontWeight: '700' },
  sectionAdd: { padding: 2 },
  sectionEmpty: { color: colors.textDim, fontSize: font.sm, marginLeft: 36 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    borderLeftWidth: 3,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: 8,
  },
  cardAchieved: { opacity: 0.6 },
  cardDragging: { borderColor: colors.accent, elevation: 8 },
  cardMain: { flex: 1, gap: 6 },
  cardName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  cardNameAchieved: { textDecorationLine: 'line-through' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTarget: { flex: 1, color: colors.textDim, fontSize: font.sm },
});
