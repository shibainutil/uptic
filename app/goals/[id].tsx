import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { usePillars } from '../../src/store/pillarStore';
import { useGoals } from '../../src/store/goalStore';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Segmented } from '../../src/components/ui/Segmented';
import { DatePicker } from '../../src/components/ui/DatePicker';
import { Toggle } from '../../src/components/ui/Toggle';
import { addDays, todayISO } from '../../src/lib/schedule';
import {
  DEFAULT_TARGET_RATE, DEFAULT_WINDOW_WEEKS,
  type Goal, type GoalInput, type GoalMode,
} from '../../src/types/goals';
import type { Pillar } from '../../src/types/pillars';
import { colors, spacing, font, radius } from '../../src/theme';

const MODE_OPTIONS: { value: GoalMode; label: string }[] = [
  { value: 'achievement', label: 'Achievement' },
  { value: 'maintenance', label: 'Maintenance' },
];

const MODE_HINT: Record<GoalMode, string> = {
  achievement: 'Reached once, then done. E.g. save €5k by June, finish the renovation.',
  maintenance: 'Never done: an ongoing state judged over a rolling window. E.g. healthy plants, stay fit.',
};

export default function GoalScreen() {
  const { id, pillarId } = useLocalSearchParams<{ id: string; pillarId?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { pillars, loaded: pillarsLoaded } = usePillars(user?.uid);
  const { goals, loaded: goalsLoaded, add, update, remove } = useGoals(user?.uid);
  const loaded = pillarsLoaded && goalsLoaded;

  const isNew = id === 'new';
  const existing = isNew ? undefined : goals.find((g) => g.id === id);

  // Wait for Firestore before mounting the form so initial state isn't empty defaults.
  if (!loaded || (!isNew && !existing)) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Header title="Goal" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{loaded ? 'Goal not found.' : 'Loading…'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <GoalForm
      key={existing?.id ?? 'new'}
      existing={existing}
      pillars={pillars}
      initialPillarId={existing?.pillarId ?? pillarId ?? pillars[0]?.id}
      add={add}
      update={update}
      remove={remove}
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

type GoalActions = Pick<ReturnType<typeof useGoals>, 'add' | 'update' | 'remove'>;

function GoalForm({
  existing, pillars, initialPillarId, add, update, remove,
}: { existing?: Goal; pillars: Pillar[]; initialPillarId?: string } & GoalActions) {
  const router = useRouter();
  const isNew = !existing;

  const [pillarId, setPillarId] = useState(initialPillarId);
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [mode, setMode] = useState<GoalMode>(existing?.mode ?? 'achievement');
  const [hasDeadline, setHasDeadline] = useState(!!existing?.deadline);
  const [deadline, setDeadline] = useState(existing?.deadline ?? addDays(todayISO(), 90));
  const [targetRate, setTargetRate] = useState(String(existing?.targetRate ?? DEFAULT_TARGET_RATE));
  const [windowWeeks, setWindowWeeks] = useState(String(existing?.windowWeeks ?? DEFAULT_WINDOW_WEEKS));
  const [saving, setSaving] = useState(false);

  const pillar = pillars.find((p) => p.id === pillarId);
  const accent = pillar?.color ?? colors.accent;

  function validate(): GoalInput | string {
    if (!pillarId || !pillar) return 'Pick a pillar.';
    if (!name.trim()) return 'Give the goal a name.';
    const base = { pillarId, name: name.trim(), description: description.trim() || undefined, mode };
    if (mode === 'achievement') {
      return {
        ...base,
        deadline: hasDeadline ? deadline : undefined,
        achievedAt: existing?.achievedAt,
        targetRate: undefined,
        windowWeeks: undefined,
      };
    }
    const rate = parseInt(targetRate, 10);
    const weeks = parseInt(windowWeeks, 10);
    if (!rate || rate < 1 || rate > 100) return 'Target rate must be between 1 and 100 %.';
    if (!weeks || weeks < 1 || weeks > 104) return 'Window must be between 1 and 104 weeks.';
    return { ...base, targetRate: rate, windowWeeks: weeks, deadline: undefined, achievedAt: undefined };
  }

  async function run(action: () => Promise<unknown>, thenBack = true) {
    setSaving(true);
    try {
      await action();
      if (thenBack) router.back();
      else setSaving(false);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save goal.');
      setSaving(false);
    }
  }

  function save() {
    if (saving) return;
    const result = validate();
    if (typeof result === 'string') { Alert.alert('Check the goal', result); return; }
    run(() => (isNew ? add(result) : update(existing!.id, result)));
  }

  function toggleAchieved() {
    if (!existing) return;
    run(() => update(existing.id, { achievedAt: existing.achievedAt ? undefined : todayISO() }));
  }

  function confirmDelete() {
    if (!existing) return;
    Alert.alert('Delete Goal', `Remove "${existing.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => remove(existing.id)) },
    ]);
  }

  const canSave = !!name.trim() && !!pillar && !saving;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title={isNew ? 'New Goal' : 'Edit Goal'} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>Pillar</Text>
          {pillars.length === 0 && (
            <Text style={styles.hint}>Create a pillar first: every goal belongs to one.</Text>
          )}
          <View style={styles.chips}>
            {pillars.map((p) => {
              const active = p.id === pillarId;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setPillarId(p.id)}
                  style={[styles.chip, active && { borderColor: p.color, backgroundColor: `${p.color}22` }]}
                >
                  <MaterialIcons name={p.icon} size={16} color={active ? p.color : colors.textMuted} />
                  <Text style={[styles.chipText, active && { color: p.color }]}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Input label="Goal" value={name} onChangeText={setName} placeholder="e.g. Save €5k emergency fund" />
        <Input
          label="Why it matters (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="What reaching this changes for you"
          multiline
        />

        <View style={styles.field}>
          <Text style={styles.label}>Type</Text>
          <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
          <Text style={styles.hint}>{MODE_HINT[mode]}</Text>
        </View>

        {mode === 'achievement' ? (
          <View style={styles.field}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Deadline</Text>
              <Toggle value={hasDeadline} onChange={setHasDeadline} />
            </View>
            {hasDeadline && <DatePicker value={deadline} onChange={setDeadline} />}
          </View>
        ) : (
          <View style={styles.field}>
            <View style={styles.formRow}>
              <View style={styles.flex1}>
                <Input label="Success rate %" value={targetRate} onChangeText={setTargetRate} keyboardType="number-pad" />
              </View>
              <View style={styles.flex1}>
                <Input label="Window (weeks)" value={windowWeeks} onChangeText={setWindowWeeks} keyboardType="number-pad" />
              </View>
            </View>
            <Text style={styles.hint}>
              On track when ≥ {targetRate || '?'}% of the linked habits' scheduled occurrences succeed over the
              last {windowWeeks || '?'} weeks. Habits will link to goals in a later update.
            </Text>
          </View>
        )}

        <View style={styles.formRow}>
          <Button label="Cancel" onPress={() => router.back()} style={styles.flex1} disabled={saving} />
          <Button
            label={isNew ? 'Create' : 'Save'}
            variant="primary"
            onPress={save}
            disabled={!canSave}
            style={styles.flex1}
          />
        </View>

        {existing && (
          <View style={styles.secondary}>
            {existing.mode === 'achievement' && (
              <Pressable onPress={toggleAchieved} disabled={saving} style={[styles.achieveBtn, { borderColor: accent }]}>
                <MaterialIcons
                  name={existing.achievedAt ? 'undo' : 'emoji-events'}
                  size={18}
                  color={accent}
                />
                <Text style={[styles.achieveText, { color: accent }]}>
                  {existing.achievedAt ? 'Reopen goal' : 'Mark as achieved'}
                </Text>
              </Pressable>
            )}
            <Pressable onPress={confirmDelete} disabled={saving} hitSlop={8}>
              <Text style={styles.delete}>Delete goal</Text>
            </Pressable>
          </View>
        )}
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
  hint: { color: colors.textDim, fontSize: font.sm, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  chipText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { color: colors.text, fontSize: font.md },
  formRow: { flexDirection: 'row', gap: spacing.md },
  flex1: { flex: 1 },
  secondary: { alignItems: 'center', gap: spacing.lg, marginTop: spacing.md },
  achieveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    alignSelf: 'stretch', paddingVertical: spacing.md, borderRadius: radius.sm, borderWidth: 1,
  },
  achieveText: { fontSize: font.md, fontWeight: '600' },
  delete: { color: colors.danger, fontSize: font.sm },
});
