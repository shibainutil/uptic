import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { NestableScrollContainer, NestableDraggableFlatList } from 'react-native-draggable-flatlist';
import { useAuth } from '../../src/context/AuthContext';
import { usePillars } from '../../src/store/pillarStore';
import { useProjects, useMigrateGoalsToProjects } from '../../src/store/projectStore';
import { useHabits, useHabitLogEntries } from '../../src/store/habitStore';
import { useProjectLatches } from '../../src/hooks/useProjectLatches';
import { Button } from '../../src/components/ui/Button';
import { ProjectCard } from '../../src/components/projects/ProjectCard';
import { ProjectOptionsSheet } from '../../src/components/projects/ProjectOptionsSheet';
import { projectProgress } from '../../src/lib/projectProgress';
import type { Project } from '../../src/types/projects';
import type { Pillar } from '../../src/types/pillars';
import type { Habit, HabitLogEntry } from '../../src/types/habits';
import { todayISO } from '../../src/lib/schedule';
import { colors, spacing, font, radius } from '../../src/theme';

export default function ProjectsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  useMigrateGoalsToProjects(user?.uid);
  const { pillars, loaded: pillarsLoaded } = usePillars(user?.uid);
  const { projects, loaded: projectsLoaded, reorder, applyLatches } = useProjects(user?.uid);
  const { habits, loaded: habitsLoaded } = useHabits(user?.uid);
  const { entries, loaded: entriesLoaded } = useHabitLogEntries(user?.uid);
  useProjectLatches(projects, habits, entries, projectsLoaded && habitsLoaded && entriesLoaded, applyLatches);
  const [menuProject, setMenuProject] = useState<Project | null>(null);
  const loaded = pillarsLoaded && projectsLoaded;
  const today = todayISO();

  const activePillars = pillars.filter((p) => !p.archivedAt);
  const openCount = projects
    .filter((p) => activePillars.some((x) => x.id === p.pillarId))
    .filter((p) => projectProgress(p, habits, entries, today).status !== 'done').length;

  if (loaded && activePillars.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.empty}>
          <MaterialIcons name="flag" size={48} color={colors.textDim} />
          <Text style={styles.emptyTitle}>Set up pillars first</Text>
          <Text style={styles.emptyText}>Every project belongs to a pillar,{'\n'}a big area of your life.</Text>
          <Button label="Go to Pillars" variant="primary" onPress={() => router.navigate('/(tabs)/pillars')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.count}>{openCount} open project{openCount !== 1 ? 's' : ''}</Text>
        <Pressable onPress={() => router.push('/projects/edit/new')} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      <NestableScrollContainer contentContainerStyle={styles.list}>
        {activePillars.map((pillar) => (
          <PillarSection
            key={pillar.id}
            pillar={pillar}
            projects={projects.filter((p) => p.pillarId === pillar.id)}
            habits={habits}
            entries={entries}
            today={today}
            onReorder={reorder}
            onOpen={(id) => router.push(`/projects/${id}`)}
            onMenu={setMenuProject}
            onOpenPillar={() => router.push(`/pillars/${pillar.id}`)}
            onAdd={() => router.push({ pathname: '/projects/edit/[id]', params: { id: 'new', pillarId: pillar.id } })}
          />
        ))}
      </NestableScrollContainer>

      <ProjectOptionsSheet project={menuProject} onClose={() => setMenuProject(null)} />
    </SafeAreaView>
  );
}

function PillarSection({
  pillar, projects, habits, entries, today, onReorder, onOpen, onMenu, onOpenPillar, onAdd,
}: {
  pillar: Pillar;
  projects: Project[];
  habits: Habit[];
  entries: HabitLogEntry[];
  today: string;
  onReorder: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onMenu: (project: Project) => void;
  onOpenPillar: () => void;
  onAdd: () => void;
}) {
  const isDone = (p: Project) => projectProgress(p, habits, entries, today).status === 'done';
  const open = projects.filter((p) => !isDone(p));
  const done = projects.filter(isDone);

  // Show the dropped order immediately; Firestore's snapshot catches up a moment later.
  const [dragOrder, setDragOrder] = useState<Project[] | null>(null);
  useEffect(() => setDragOrder(null), [projects]);

  const card = (project: Project, drag?: () => void, isActive?: boolean) => (
    <ProjectCard
      project={project}
      habits={habits}
      entries={entries}
      today={today}
      color={pillar.color}
      onPress={() => onOpen(project.id)}
      onMenu={() => onMenu(project)}
      onDrag={open.length > 1 ? drag : undefined}
      dragging={isActive}
    />
  );

  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <Pressable style={styles.sectionTitleTap} onPress={onOpenPillar} hitSlop={4}>
          <View style={[styles.pillarIcon, { backgroundColor: `${pillar.color}22` }]}>
            <MaterialIcons name={pillar.icon} size={16} color={pillar.color} />
          </View>
          <Text style={[styles.sectionTitle, { color: pillar.color }]}>{pillar.name}</Text>
        </Pressable>
        <Pressable onPress={onAdd} hitSlop={8} style={styles.sectionAdd}>
          <MaterialIcons name="add" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
      {projects.length === 0 && <Text style={styles.sectionEmpty}>No projects yet</Text>}

      <NestableDraggableFlatList
        data={dragOrder ?? open}
        keyExtractor={(item) => item.id}
        activationDistance={10}
        onDragEnd={({ data }) => { setDragOrder(data); onReorder(data.map((p) => p.id)); }}
        renderItem={({ item, drag, isActive }) => card(item, drag, isActive)}
      />
      {done.map((p) => <View key={p.id}>{card(p)}</View>)}
    </View>
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
  sectionTitleTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pillarIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: font.md, fontWeight: '700' },
  sectionAdd: { padding: 2 },
  sectionEmpty: { color: colors.textDim, fontSize: font.sm, marginLeft: 36 },
});
