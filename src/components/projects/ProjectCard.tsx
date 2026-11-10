import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Badge } from '../ui/Badge';
import { DragHandle } from '../ui/DragHandle';
import { projectProgress, type ProjectStatus } from '../../lib/projectProgress';
import type { Project } from '../../types/projects';
import type { Habit, HabitLogEntry } from '../../types/habits';
import { colors, spacing, font, radius } from '../../theme';

export const STATUS_BADGE: Record<ProjectStatus, { label: string; color: string }> = {
  active:  { label: 'Active',  color: colors.accent },
  overdue: { label: 'Overdue', color: colors.danger },
  done:    { label: 'Done',    color: colors.success },
};

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  project: Project;
  habits: Habit[];
  entries: HabitLogEntry[];
  today: string;
  /** Pillar colour for the progress bar. */
  color: string;
  onPress: () => void;
  onMenu: () => void;
  onDrag?: () => void;
  dragging?: boolean;
}

export function ProjectCard({ project, habits, entries, today, color, onPress, onMenu, onDrag, dragging }: Props) {
  const p = projectProgress(project, habits, entries, today);
  const done = p.status === 'done';
  const badge = STATUS_BADGE[p.status];
  const detail = done
    ? (project.completedAt ? `Done ${formatShortDate(project.completedAt)}` : 'Done')
    : p.next ? `Next: ${p.next.title}`
      : p.total === 0 ? 'No milestones yet' : '';

  return (
    <Pressable
      style={[styles.card, dragging && styles.cardDragging]}
      onPress={onPress}
      onLongPress={onDrag}
      delayLongPress={250}
      disabled={dragging}
    >
      <View style={[styles.main, done && styles.dimmed]}>
        <Text style={[styles.name, done && styles.nameDone]} numberOfLines={2}>{project.name}</Text>
        <View style={styles.meta}>
          <Badge label={badge.label} color={badge.color} />
          {p.total > 0 && <Text style={styles.count}>{p.met}/{p.total}</Text>}
          <Text style={styles.detail} numberOfLines={1}>{detail}</Text>
        </View>
        {p.total > 0 && !done && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(p.met / p.total) * 100}%`, backgroundColor: color }]} />
          </View>
        )}
      </View>
      <DragHandle onPress={onMenu} onDrag={onDrag} active={dragging} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  cardDragging: { borderColor: colors.accent, backgroundColor: colors.surface2 },
  main: { flex: 1, gap: 6 },
  dimmed: { opacity: 0.6 },
  name: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  nameDone: { textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  count: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  detail: { flex: 1, color: colors.textDim, fontSize: font.sm },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
