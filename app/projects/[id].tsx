import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { usePillars } from '../../src/store/pillarStore';
import { useProjects } from '../../src/store/projectStore';
import { useHabits, useHabitLogEntries } from '../../src/store/habitStore';
import { useProjectLatches } from '../../src/hooks/useProjectLatches';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { ActionSheet, type ActionSheetItem } from '../../src/components/ui/ActionSheet';
import { STATUS_BADGE, formatShortDate } from '../../src/components/projects/ProjectCard';
import { ProjectOptionsSheet } from '../../src/components/projects/ProjectOptionsSheet';
import { HabitTargetRow } from '../../src/components/projects/HabitTargetRow';
import { milestoneMet, projectProgress } from '../../src/lib/projectProgress';
import { diffDays, todayISO } from '../../src/lib/schedule';
import type { Milestone, Project } from '../../src/types/projects';
import { colors, spacing, font, radius } from '../../src/theme';

function plural(n: number, word: string) {
  return `${n} ${word}${n !== 1 ? 's' : ''}`;
}

function errorAlert(e: unknown) {
  Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
}

export default function ProjectOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { pillars } = usePillars(user?.uid);
  const {
    projects, loaded, setTaskDone, removeMilestone, reorderMilestones, applyLatches,
  } = useProjects(user?.uid);
  const { habits, loaded: habitsLoaded } = useHabits(user?.uid);
  const { entries, loaded: entriesLoaded } = useHabitLogEntries(user?.uid);
  useProjectLatches(projects, habits, entries, loaded && habitsLoaded && entriesLoaded, applyLatches);
  const [menuProject, setMenuProject] = useState<Project | null>(null);
  const [menuMilestone, setMenuMilestone] = useState<Milestone | null>(null);

  const project = projects.find((p) => p.id === id);
  const pillar = pillars.find((p) => p.id === project?.pillarId);
  const today = todayISO();

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.headerSide}><Text style={styles.backText}>‹ Back</Text></Pressable>
      <Text style={styles.headerTitle}>Project</Text>
      <View style={[styles.headerSide, styles.headerRight]}>
        {project && (
          <Pressable onPress={() => setMenuProject(project)} hitSlop={10}>
            <MaterialIcons name="menu" size={24} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );

  if (!project) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {header}
        <View style={styles.empty}><Text style={styles.emptyText}>{loaded ? 'Project not found.' : 'Loading…'}</Text></View>
      </SafeAreaView>
    );
  }

  const progress = projectProgress(project, habits, entries, today);
  const badge = STATUS_BADGE[progress.status];
  const accent = pillar?.color ?? colors.accent;
  const addMilestone = () => router.push({ pathname: '/projects/milestone/[id]', params: { id: 'new', projectId: project.id } });

  let deadlineText: string | null = null;
  if (project.deadline && progress.status !== 'done') {
    const left = diffDays(project.deadline, today);
    deadlineText = left > 0 ? `${plural(left, 'day')} left` : left === 0 ? 'Due today' : `${plural(-left, 'day')} overdue`;
  }

  const milestoneItems: ActionSheetItem[] = [];
  if (menuMilestone) {
    const m = menuMilestone;
    const idx = project.milestones.findIndex((x) => x.id === m.id);
    const ids = project.milestones.map((x) => x.id);
    const move = (to: number) => {
      const next = ids.slice();
      next.splice(idx, 1);
      next.splice(to, 0, m.id);
      reorderMilestones(project.id, next).catch(errorAlert);
    };
    milestoneItems.push({
      label: 'Edit',
      icon: 'edit',
      onPress: () => router.push({ pathname: '/projects/milestone/[id]', params: { id: m.id, projectId: project.id } }),
    });
    if (idx > 0) milestoneItems.push({ label: 'Move up', icon: 'arrow-upward', onPress: () => move(idx - 1) });
    if (idx < ids.length - 1) milestoneItems.push({ label: 'Move down', icon: 'arrow-downward', onPress: () => move(idx + 1) });
    milestoneItems.push({
      label: 'Delete',
      icon: 'delete-outline',
      destructive: true,
      onPress: () => Alert.alert('Delete Milestone', `Remove "${m.title}" and its tasks?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeMilestone(project.id, m.id).catch(errorAlert) },
      ]),
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        {/* Hero */}
        <View style={styles.hero}>
          {pillar && (
            <Pressable
              style={[styles.pillarChip, { backgroundColor: `${pillar.color}22` }]}
              onPress={() => router.push(`/pillars/${pillar.id}`)}
            >
              <MaterialIcons name={pillar.icon} size={14} color={pillar.color} />
              <Text style={[styles.pillarChipText, { color: pillar.color }]}>{pillar.name}</Text>
            </Pressable>
          )}
          <Text style={[styles.name, progress.status === 'done' && styles.nameDone]}>{project.name}</Text>
          <View style={styles.heroMeta}>
            <Badge label={badge.label} color={badge.color} />
            {project.completedAt && progress.status === 'done'
              ? <Text style={styles.metaText}>{formatShortDate(project.completedAt)}</Text>
              : project.deadline
                ? <Text style={[styles.metaText, progress.status === 'overdue' && { color: colors.danger }]}>
                    {deadlineText} · by {formatShortDate(project.deadline)}
                  </Text>
                : null}
          </View>
        </View>

        {/* Goal */}
        <View style={styles.goalCard}>
          <View style={styles.goalHead}>
            <MaterialIcons name="flag" size={16} color={accent} />
            <Text style={[styles.goalLabel, { color: accent }]}>Goal</Text>
          </View>
          <Text style={project.goal ? styles.goalText : styles.goalMissing}>
            {project.goal || 'No goal written yet. Edit the project to say what success looks like.'}
          </Text>
          {progress.total > 0 && (
            <View style={styles.progressBlock}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(progress.met / progress.total) * 100}%`, backgroundColor: accent }]} />
              </View>
              <Text style={styles.progressText}>{progress.met} of {plural(progress.total, 'milestone')} met</Text>
            </View>
          )}
        </View>

        {/* Milestones */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Milestones</Text>
            <Pressable onPress={addMilestone} hitSlop={8}><Text style={styles.sectionAction}>+ Add</Text></Pressable>
          </View>
          {project.milestones.length === 0 ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                Break the project into milestones. Each one is a set of tasks to tick off and/or habits to bring to a target.
              </Text>
              <Button label="Add first milestone" variant="primary" onPress={addMilestone} />
            </View>
          ) : (
            project.milestones.map((m, i) => {
              const met = milestoneMet(m, habits, entries, today);
              const isNext = progress.next?.id === m.id;
              const overdue = !met && m.dueDate && today > m.dueDate;
              return (
                <View key={m.id} style={[styles.milestone, isNext && { borderColor: `${accent}88` }]}>
                  <View style={styles.milestoneHead}>
                    <MaterialIcons
                      name={met ? 'check-circle' : 'radio-button-unchecked'}
                      size={22}
                      color={met ? colors.success : isNext ? accent : colors.textDim}
                    />
                    <View style={styles.flex1}>
                      <Text style={[styles.milestoneTitle, met && styles.milestoneTitleMet]}>
                        {i + 1}. {m.title}
                      </Text>
                      {m.dueDate ? (
                        <Text style={[styles.milestoneDue, overdue && { color: colors.danger }]}>
                          {overdue ? 'Overdue · ' : 'Due '}{formatShortDate(m.dueDate)}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable onPress={() => setMenuMilestone(m)} hitSlop={10}>
                      <MaterialIcons name="menu" size={22} color={colors.textMuted} />
                    </Pressable>
                  </View>

                  {m.criteria.length === 0 ? (
                    <Text style={styles.criteriaEmpty}>No tasks or habit targets yet. Edit to add some.</Text>
                  ) : (
                    <View style={styles.criteria}>
                      {m.criteria.map((c) => (c.kind === 'task' ? (
                        <Pressable
                          key={c.id}
                          style={styles.task}
                          onPress={() => setTaskDone(project.id, m.id, c.id, !c.doneAt).catch(errorAlert)}
                        >
                          <MaterialIcons
                            name={c.doneAt ? 'check-box' : 'check-box-outline-blank'}
                            size={22}
                            color={c.doneAt ? colors.success : colors.textMuted}
                          />
                          <Text style={[styles.taskText, c.doneAt && styles.taskDone]}>{c.title}</Text>
                        </Pressable>
                      ) : (
                        <HabitTargetRow
                          key={c.id}
                          criterion={c}
                          habits={habits}
                          entries={entries}
                          today={today}
                          onPress={() => router.push(`/habits/habit/${c.habitId}`)}
                        />
                      )))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <ProjectOptionsSheet project={menuProject} onClose={() => setMenuProject(null)} onDeleted={() => router.back()} />
      <ActionSheet
        visible={!!menuMilestone}
        title={menuMilestone?.title}
        items={milestoneItems}
        onClose={() => setMenuMilestone(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
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
  hero: { gap: spacing.sm },
  pillarChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 4,
  },
  pillarChipText: { fontSize: font.sm, fontWeight: '600' },
  name: { color: colors.text, fontSize: 24, fontWeight: '700' },
  nameDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaText: { color: colors.textMuted, fontSize: font.sm },
  goalCard: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.surface2,
    padding: spacing.lg, gap: spacing.sm,
  },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  goalText: { color: colors.text, fontSize: font.md, lineHeight: 22 },
  goalMissing: { color: colors.textDim, fontSize: font.sm, fontStyle: 'italic' },
  progressBlock: { gap: 6, marginTop: spacing.xs },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  progressText: { color: colors.textMuted, fontSize: font.sm },
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sectionAction: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
  placeholder: {
    gap: spacing.md, padding: spacing.lg, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.surface2, borderStyle: 'dashed',
  },
  placeholderText: { color: colors.textDim, fontSize: font.sm, lineHeight: 20 },
  milestone: {
    backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface2,
    padding: spacing.md, gap: spacing.sm,
  },
  milestoneHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  milestoneTitle: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  milestoneTitleMet: { color: colors.textMuted },
  milestoneDue: { color: colors.textDim, fontSize: font.sm },
  criteriaEmpty: { color: colors.textDim, fontSize: font.sm, marginLeft: 34 },
  criteria: { marginLeft: 34, borderTopWidth: 1, borderTopColor: colors.surface2, paddingTop: spacing.xs },
  task: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  taskText: { flex: 1, color: colors.text, fontSize: font.md },
  taskDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
