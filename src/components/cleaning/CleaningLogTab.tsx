import { View, Text, Pressable, SectionList, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useCleaningTasks, useCleaningSessions } from '../../store/cleaningStore';
import { fromISO, todayISO } from '../../lib/schedule';
import type { CleaningSession, CleaningTask } from '../../types/cleaning';
import { colors, spacing, font, radius } from '../../theme';

function sessionLabel(session: CleaningSession, task: CleaningTask | undefined, finiteSessions: CleaningSession[]): string {
  if (!task) return 'Unknown task';
  if (task.kind === 'periodic') {
    return `${task.name} · ${session.variant === 'deep' ? 'Deep clean' : 'Normal clean'}`;
  }
  const sorted = finiteSessions.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const index = sorted.findIndex((s) => s.id === session.id);
  return `${task.name} · session ${index + 1} of ${task.targetSessions ?? sorted.length}`;
}

function dueLabel(dueDate: string): string {
  return fromISO(dueDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function CleaningLogTab() {
  const { user } = useAuth();
  const { tasks } = useCleaningTasks(user?.uid);
  const { sessions, setStatus, remove } = useCleaningSessions(user?.uid);

  const today = todayISO();
  const active = sessions.filter((s) => s.status !== 'completed' && !s.rescheduledTo && !s.deleted);

  const overdue = active.filter((s) => s.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dueToday = active.filter((s) => s.dueDate === today);
  const upcoming = active.filter((s) => s.dueDate > today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const sections = [
    { title: 'Overdue', data: overdue },
    { title: 'Due Today', data: dueToday },
    { title: 'Upcoming', data: upcoming },
  ].filter((s) => s.data.length > 0);

  if (sections.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialIcons name="check-circle" size={48} color={colors.textDim} />
        <Text style={styles.emptyText}>Nothing due.{'\n'}Add a task in the Tasks tab.</Text>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      renderItem={({ item }) => {
        const task = tasks.find((t) => t.id === item.taskId);
        const finiteSessions = task?.kind === 'finite'
          ? sessions.filter((s) => s.taskId === task.id && !s.rescheduledTo && !s.deleted)
          : [];
        const overdueRow = item.dueDate < today;
        return (
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>{sessionLabel(item, task, finiteSessions)}</Text>
              <Text style={[styles.rowDue, overdueRow && styles.rowDueOverdue]}>{dueLabel(item.dueDate)}</Text>
            </View>
            <View style={styles.rowActions}>
              <Pressable onPress={() => remove(item.id)} hitSlop={8} style={styles.iconBtn}>
                <MaterialIcons name="close" size={18} color={colors.textMuted} />
              </Pressable>
              <Pressable onPress={() => setStatus(item.id, 'completed')} style={styles.doneBtn}>
                <MaterialIcons name="check" size={16} color="#fff" />
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  list: { padding: spacing.lg },
  sep: { height: 8 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowMain: { flex: 1, gap: 4 },
  rowLabel: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  rowDue: { color: colors.textDim, fontSize: font.sm },
  rowDueOverdue: { color: colors.danger, fontWeight: '600' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: { padding: spacing.xs },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  doneBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '600' },
});
