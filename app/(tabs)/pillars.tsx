import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { useAuth } from '../../src/context/AuthContext';
import { usePillars } from '../../src/store/pillarStore';
import { useGoals } from '../../src/store/goalStore';
import { SUGGESTED_PILLARS, type Pillar } from '../../src/types/pillars';
import type { Goal } from '../../src/types/goals';
import { Button } from '../../src/components/ui/Button';
import { DragHandle } from '../../src/components/ui/DragHandle';
import { colors, spacing, font, radius } from '../../src/theme';

function goalSummary(goals: Goal[]): string {
  if (goals.length === 0) return 'No goals';
  const open = goals.filter((g) => !g.achievedAt).length;
  const total = `${goals.length} goal${goals.length !== 1 ? 's' : ''}`;
  if (open === goals.length) return total;
  return open === 0 ? `${total} · all achieved` : `${total} · ${open} open`;
}

export default function PillarsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { pillars, loaded, addMany, reorder } = usePillars(user?.uid);
  const { goals } = useGoals(user?.uid);
  const [showArchived, setShowArchived] = useState(false);

  const active = pillars.filter((p) => !p.archivedAt);
  const archived = pillars.filter((p) => p.archivedAt);
  const goalsOf = (pillarId: string) => goals.filter((g) => g.pillarId === pillarId);

  // Show the dropped order immediately; Firestore's snapshot catches up a moment later.
  const [dragOrder, setDragOrder] = useState<Pillar[] | null>(null);
  useEffect(() => setDragOrder(null), [pillars]);
  const list = dragOrder ?? active;

  const open = (id: string) => router.push(`/pillars/${id}`);

  if (loaded && pillars.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.empty}>
          <MaterialIcons name="account-balance" size={48} color={colors.textDim} />
          <Text style={styles.emptyTitle}>No pillars yet</Text>
          <Text style={styles.emptyText}>
            Pillars are the big areas of your life.{'\n'}Every goal will belong to one.
          </Text>
          <View style={styles.suggestions}>
            {SUGGESTED_PILLARS.map((p) => (
              <View key={p.name} style={[styles.suggestion, { backgroundColor: `${p.color}22` }]}>
                <MaterialIcons name={p.icon} size={14} color={p.color} />
                <Text style={[styles.suggestionText, { color: p.color }]}>{p.name}</Text>
              </View>
            ))}
          </View>
          <Button label="Start with these five" variant="primary" onPress={() => addMany(SUGGESTED_PILLARS)} />
          <Pressable onPress={() => router.push('/pillars/new')} hitSlop={8}>
            <Text style={styles.link}>or create your own</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.count}>{active.length} pillar{active.length !== 1 ? 's' : ''}</Text>
        <Pressable onPress={() => router.push('/pillars/new')} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      <DraggableFlatList
        data={list}
        keyExtractor={(item) => item.id}
        containerStyle={styles.flex}
        contentContainerStyle={styles.list}
        activationDistance={10}
        onDragEnd={({ data }) => {
          setDragOrder(data);
          reorder([...data.map((p) => p.id), ...archived.map((p) => p.id)]);
        }}
        renderItem={({ item, drag, isActive }) => (
          <ScaleDecorator activeScale={1.03}>
            <PillarCard
              pillar={item}
              summary={goalSummary(goalsOf(item.id))}
              onPress={() => open(item.id)}
              onDrag={drag}
              dragging={isActive}
            />
          </ScaleDecorator>
        )}
        ListFooterComponent={archived.length ? (
          <View style={styles.archived}>
            <Pressable style={styles.archivedToggle} onPress={() => setShowArchived((v) => !v)} hitSlop={6}>
              <MaterialIcons name={showArchived ? 'expand-less' : 'expand-more'} size={20} color={colors.textMuted} />
              <Text style={styles.archivedTitle}>Archived ({archived.length})</Text>
            </Pressable>
            {showArchived && archived.map((p) => (
              <PillarCard key={p.id} pillar={p} summary={goalSummary(goalsOf(p.id))} onPress={() => open(p.id)} dimmed />
            ))}
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

function PillarCard({
  pillar, summary, onPress, onDrag, dragging, dimmed,
}: {
  pillar: Pillar;
  summary: string;
  onPress: () => void;
  onDrag?: () => void;
  dragging?: boolean;
  dimmed?: boolean;
}) {
  return (
    <Pressable
      style={[styles.card, dragging && styles.cardDragging, dimmed && styles.cardDimmed]}
      onPress={onPress}
      onLongPress={onDrag}
      delayLongPress={250}
      disabled={dragging}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${pillar.color}22` }]}>
        <MaterialIcons name={pillar.icon} size={22} color={pillar.color} />
      </View>
      <View style={styles.cardMain}>
        <Text style={styles.cardName}>{pillar.name}</Text>
        {pillar.description ? <Text style={styles.cardDesc} numberOfLines={2}>{pillar.description}</Text> : null}
        <Text style={styles.cardGoals}>{summary}</Text>
      </View>
      {onDrag && <DragHandle onPress={onPress} onDrag={onDrag} active={dragging} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
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
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 4 },
  suggestionText: { fontSize: font.sm, fontWeight: '600' },
  link: { color: colors.accent, fontSize: font.sm },
  list: { padding: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: 8,
  },
  cardDragging: { borderColor: colors.accent, elevation: 8 },
  cardDimmed: { opacity: 0.6 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardMain: { flex: 1, gap: 2 },
  cardName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  cardDesc: { color: colors.textDim, fontSize: font.sm },
  cardGoals: { color: colors.textMuted, fontSize: font.sm },
  archived: { marginTop: spacing.lg, gap: 8 },
  archivedToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  archivedTitle: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
});
