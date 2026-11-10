import { View, Text, Pressable, SectionList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { usePillars } from '../../src/store/pillarStore';
import { useGoals } from '../../src/store/goalStore';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { describeGoalTarget, goalStatus, type Goal, type GoalStatus } from '../../src/types/goals';
import type { Pillar } from '../../src/types/pillars';
import { todayISO } from '../../src/lib/schedule';
import { colors, spacing, font, radius } from '../../src/theme';

const STATUS_BADGE: Record<GoalStatus, { label: string; color: string }> = {
  active:   { label: 'Active',   color: colors.accent },
  overdue:  { label: 'Overdue',  color: colors.danger },
  achieved: { label: 'Achieved', color: colors.success },
  ongoing:  { label: 'Ongoing',  color: '#A855F7' },
};

export default function GoalsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { pillars, loaded: pillarsLoaded } = usePillars(user?.uid);
  const { goals, loaded: goalsLoaded, move } = useGoals(user?.uid);
  const loaded = pillarsLoaded && goalsLoaded;
  const today = todayISO();

  // Achieved goals sink to the bottom of their pillar; otherwise keep the user's order.
  const sections = pillars.map((pillar) => {
    const own = goals.filter((g) => g.pillarId === pillar.id);
    return {
      pillar,
      data: [...own.filter((g) => !g.achievedAt), ...own.filter((g) => g.achievedAt)],
      reorderable: own.filter((g) => !g.achievedAt).length,
    };
  });
  // Goals whose pillar was removed outside the app (shouldn't happen; deletion is blocked).
  const orphans = goals.filter((g) => !pillars.some((p) => p.id === g.pillarId));
  const openCount = goals.filter((g) => goalStatus(g, today) !== 'achieved').length;

  if (loaded && pillars.length === 0) {
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

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <PillarHeader
            pillar={section.pillar}
            empty={section.data.length === 0}
            onAdd={() => router.push({ pathname: '/goals/[id]', params: { id: 'new', pillarId: section.pillar.id } })}
          />
        )}
        renderItem={({ item, index, section }) => (
          <GoalCard
            goal={item}
            color={section.pillar.color}
            today={today}
            canMoveUp={!item.achievedAt && index > 0}
            canMoveDown={!item.achievedAt && index < section.reorderable - 1}
            onMove={section.reorderable > 1 ? (dir) => move(item.id, dir) : undefined}
            onPress={() => router.push(`/goals/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListFooterComponent={orphans.length ? (
          <View style={styles.orphans}>
            <Text style={styles.orphanTitle}>Without pillar</Text>
            {orphans.map((g) => (
              <GoalCard key={g.id} goal={g} color={colors.textMuted} today={today} onPress={() => router.push(`/goals/${g.id}`)} />
            ))}
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

function PillarHeader({ pillar, empty, onAdd }: { pillar: Pillar; empty: boolean; onAdd: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <View style={[styles.pillarIcon, { backgroundColor: `${pillar.color}22` }]}>
          <MaterialIcons name={pillar.icon} size={16} color={pillar.color} />
        </View>
        <Text style={[styles.sectionTitle, { color: pillar.color }]}>{pillar.name}</Text>
        <Pressable onPress={onAdd} hitSlop={8} style={styles.sectionAdd}>
          <MaterialIcons name="add" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
      {empty && <Text style={styles.sectionEmpty}>No goals yet</Text>}
    </View>
  );
}

function GoalCard({
  goal, color, today, canMoveUp, canMoveDown, onMove, onPress,
}: {
  goal: Goal;
  color: string;
  today: string;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove?: (dir: -1 | 1) => void;
  onPress: () => void;
}) {
  const status = goalStatus(goal, today);
  const badge = STATUS_BADGE[status];
  const achieved = status === 'achieved';
  return (
    <Pressable style={[styles.card, { borderLeftColor: color }, achieved && styles.cardAchieved]} onPress={onPress}>
      <View style={styles.cardMain}>
        <Text style={[styles.cardName, achieved && styles.cardNameAchieved]} numberOfLines={2}>{goal.name}</Text>
        <View style={styles.cardMeta}>
          <Badge label={badge.label} color={badge.color} />
          <Text style={styles.cardTarget} numberOfLines={1}>
            {goal.mode === 'maintenance' ? 'Maintain ' : ''}{describeGoalTarget(goal)}
          </Text>
        </View>
      </View>
      {onMove && !achieved && (
        <View style={styles.reorder}>
          <Pressable onPress={() => onMove(-1)} disabled={!canMoveUp} hitSlop={6}>
            <MaterialIcons name="keyboard-arrow-up" size={20} color={canMoveUp ? colors.textMuted : colors.textDim} />
          </Pressable>
          <Pressable onPress={() => onMove(1)} disabled={!canMoveDown} hitSlop={6}>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={canMoveDown ? colors.textMuted : colors.textDim} />
          </Pressable>
        </View>
      )}
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
  sep: { height: 8 },
  sectionHeader: { paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  },
  cardAchieved: { opacity: 0.6 },
  cardMain: { flex: 1, gap: 6 },
  cardName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  cardNameAchieved: { textDecorationLine: 'line-through' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTarget: { flex: 1, color: colors.textDim, fontSize: font.sm },
  reorder: { alignItems: 'center' },
  orphans: { paddingTop: spacing.lg, gap: spacing.sm },
  orphanTitle: { color: colors.textMuted, fontSize: font.md, fontWeight: '700' },
});
