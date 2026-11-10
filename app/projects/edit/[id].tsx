import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { usePillars } from '../../../src/store/pillarStore';
import { useProjects } from '../../../src/store/projectStore';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { DatePicker } from '../../../src/components/ui/DatePicker';
import { Toggle } from '../../../src/components/ui/Toggle';
import { addDays, todayISO } from '../../../src/lib/schedule';
import type { Project } from '../../../src/types/projects';
import type { Pillar } from '../../../src/types/pillars';
import { colors, spacing, font, radius } from '../../../src/theme';

export default function ProjectEditScreen() {
  const { id, pillarId } = useLocalSearchParams<{ id: string; pillarId?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { pillars, loaded: pillarsLoaded } = usePillars(user?.uid);
  const { projects, loaded: projectsLoaded, add, update } = useProjects(user?.uid);
  const loaded = pillarsLoaded && projectsLoaded;

  const isNew = id === 'new';
  const existing = isNew ? undefined : projects.find((p) => p.id === id);

  // Wait for Firestore before mounting the form so initial state isn't empty defaults.
  if (!loaded || (!isNew && !existing)) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Header title="Project" onBack={() => router.back()} />
        <View style={styles.empty}><Text style={styles.emptyText}>{loaded ? 'Project not found.' : 'Loading…'}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <ProjectForm
      key={existing?.id ?? 'new'}
      existing={existing}
      // Archived pillars can't take new projects, but a project already in one keeps showing it.
      pillars={pillars.filter((p) => !p.archivedAt || p.id === existing?.pillarId)}
      initialPillarId={existing?.pillarId ?? pillarId ?? pillars.find((p) => !p.archivedAt)?.id}
      add={add}
      update={update}
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

type Actions = Pick<ReturnType<typeof useProjects>, 'add' | 'update'>;

function ProjectForm({
  existing, pillars, initialPillarId, add, update,
}: { existing?: Project; pillars: Pillar[]; initialPillarId?: string } & Actions) {
  const router = useRouter();
  const isNew = !existing;

  const [pillarId, setPillarId] = useState(initialPillarId);
  const [name, setName] = useState(existing?.name ?? '');
  const [goal, setGoal] = useState(existing?.goal ?? '');
  const [hasDeadline, setHasDeadline] = useState(!!existing?.deadline);
  const [deadline, setDeadline] = useState(existing?.deadline ?? addDays(todayISO(), 90));
  const [saving, setSaving] = useState(false);

  const pillar = pillars.find((p) => p.id === pillarId);
  const canSave = !!name.trim() && !!pillar && !saving;

  async function save() {
    if (!canSave || !pillarId) return;
    const data = {
      pillarId,
      name: name.trim(),
      goal: goal.trim(),
      deadline: hasDeadline ? deadline : undefined,
    };
    setSaving(true);
    try {
      if (isNew) {
        const id = await add({ ...data, milestones: [] });
        router.replace(`/projects/${id}`); // straight to the overview to add milestones
      } else {
        await update(existing!.id, data);
        router.back();
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save project.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title={isNew ? 'New Project' : 'Edit Project'} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>Pillar</Text>
          {pillars.length === 0 && <Text style={styles.hint}>Create a pillar first: every project belongs to one.</Text>}
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

        <Input label="Project" value={name} onChangeText={setName} placeholder="e.g. Remodel the entrance" />

        <View style={styles.field}>
          <Input
            label="Goal"
            value={goal}
            onChangeText={setGoal}
            placeholder="What does success look like?"
            multiline
            style={styles.goalInput}
          />
          <Text style={styles.hint}>
            The outcome you're after, e.g. "Entrance looks finished and welcoming". Milestones measure the way there.
          </Text>
        </View>

        <View style={styles.field}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Deadline</Text>
            <Toggle value={hasDeadline} onChange={setHasDeadline} />
          </View>
          {hasDeadline && <DatePicker value={deadline} onChange={setDeadline} />}
        </View>

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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
  field: { gap: spacing.sm },
  label: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  hint: { color: colors.textDim, fontSize: font.sm, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  chipText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  goalInput: { minHeight: 72, textAlignVertical: 'top' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { color: colors.text, fontSize: font.md },
  formRow: { flexDirection: 'row', gap: spacing.md },
  flex1: { flex: 1 },
});
