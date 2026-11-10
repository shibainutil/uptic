import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { usePillars } from '../../src/store/pillarStore';
import { useProjects } from '../../src/store/projectStore';
import { useHabits, useHabitLogEntries } from '../../src/store/habitStore';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { ProjectCard } from '../../src/components/projects/ProjectCard';
import { ProjectOptionsSheet } from '../../src/components/projects/ProjectOptionsSheet';
import { HabitTargetRow } from '../../src/components/projects/HabitTargetRow';
import { PillarOptionsSheet } from '../../src/components/pillars/PillarOptionsSheet';
import { projectProgress } from '../../src/lib/projectProgress';
import type { HabitCriterion, Project } from '../../src/types/projects';
import type { Pillar } from '../../src/types/pillars';
import { todayISO } from '../../src/lib/schedule';
import { colors, spacing, font, radius } from '../../src/theme';

export default function PillarOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { pillars, loaded } = usePillars(user?.uid);
  const { projects } = useProjects(user?.uid);
  const { habits } = useHabits(user?.uid);
  const { entries } = useHabitLogEntries(user?.uid);
  const [menuPillar, setMenuPillar] = useState<Pillar | null>(null);
  const [menuProject, setMenuProject] = useState<Project | null>(null);

  const pillar = pillars.find((p) => p.id === id);
  const today = todayISO();

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.headerSide}><Text style={styles.backText}>‹ Back</Text></Pressable>
      <Text style={styles.headerTitle}>Pillar</Text>
      <View style={[styles.headerSide, styles.headerRight]}>
        {pillar && (
          <Pressable onPress={() => setMenuPillar(pillar)} hitSlop={10}>
            <MaterialIcons name="menu" size={24} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );

  if (!pillar) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {header}
        <View style={styles.empty}><Text style={styles.emptyText}>{loaded ? 'Pillar not found.' : 'Loading…'}</Text></View>
      </SafeAreaView>
    );
  }

  const own = projects.filter((p) => p.pillarId === pillar.id);
  const statusOf = (p: Project) => projectProgress(p, habits, entries, today).status;
  const open = own.filter((p) => statusOf(p) !== 'done');
  const done = own.filter((p) => statusOf(p) === 'done');
  const overdue = own.filter((p) => statusOf(p) === 'overdue').length;
  // Habit targets still being worked on, across this pillar's open projects.
  const activeTargets = open.flatMap((p) => p.milestones.flatMap((m) => m.criteria
    .filter((c): c is HabitCriterion => c.kind === 'habit' && !c.metAt)
    .map((c) => ({ c, project: p }))));
  const newProject = () => router.push({ pathname: '/projects/edit/[id]', params: { id: 'new', pillarId: pillar.id } });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: `${pillar.color}22` }]}>
            <MaterialIcons name={pillar.icon} size={36} color={pillar.color} />
          </View>
          <Text style={[styles.name, { color: pillar.color }]}>{pillar.name}</Text>
          {pillar.description ? <Text style={styles.description}>{pillar.description}</Text> : null}
          {pillar.archivedAt ? <Badge label="Archived" color={colors.textMuted} /> : null}
        </View>

        <View style={styles.stats}>
          <Stat value={open.length} label="open projects" />
          <Stat value={done.length} label="done" />
          <Stat value={activeTargets.length} label="habit targets" />
          {overdue > 0 && <Stat value={overdue} label="overdue" tone={colors.danger} />}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Projects</Text>
            {!pillar.archivedAt && (
              <Pressable onPress={newProject} hitSlop={8}><Text style={styles.sectionAction}>+ Add project</Text></Pressable>
            )}
          </View>
          {own.length === 0 ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>No projects in this pillar yet.</Text>
              {!pillar.archivedAt && <Button label="Create the first project" variant="primary" onPress={newProject} />}
            </View>
          ) : (
            <View>
              {[...open, ...done].map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  habits={habits}
                  entries={entries}
                  today={today}
                  color={pillar.color}
                  onPress={() => router.push(`/projects/${p.id}`)}
                  onMenu={() => setMenuProject(p)}
                />
              ))}
            </View>
          )}
        </View>

        {activeTargets.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Habits in progress</Text>
            <View style={styles.targets}>
              {activeTargets.map(({ c, project }) => (
                <View key={c.id}>
                  <Text style={styles.targetProject} numberOfLines={1}>{project.name}</Text>
                  <HabitTargetRow
                    criterion={c}
                    habits={habits}
                    entries={entries}
                    today={today}
                    onPress={() => router.push(`/projects/${project.id}`)}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tasks</Text>
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              Standalone one-off tasks for this pillar will show here once the Tasks module exists.
            </Text>
          </View>
        </View>
      </ScrollView>

      <PillarOptionsSheet pillar={menuPillar} onClose={() => setMenuPillar(null)} onDeleted={() => router.back()} />
      <ProjectOptionsSheet project={menuProject} onClose={() => setMenuProject(null)} />
    </SafeAreaView>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
  },
  headerSide: { width: 56 },
  headerRight: { alignItems: 'flex-end' },
  backText: { color: colors.accent, fontSize: font.md },
  headerTitle: { flex: 1, color: colors.text, fontSize: font.lg, fontWeight: '600', textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textDim, fontSize: font.md },
  body: { padding: spacing.lg, gap: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.sm },
  heroIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 24, fontWeight: '700' },
  description: { color: colors.textMuted, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  stats: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.surface2, paddingVertical: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontSize: font.xl, fontWeight: '700' },
  statLabel: { color: colors.textDim, fontSize: 11 },
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sectionAction: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
  targets: {
    backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface2,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: spacing.xs,
  },
  targetProject: { color: colors.textDim, fontSize: 11, marginTop: spacing.sm },
  placeholder: {
    gap: spacing.md, padding: spacing.lg, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.surface2, borderStyle: 'dashed',
  },
  placeholderText: { color: colors.textDim, fontSize: font.sm, lineHeight: 20 },
});
