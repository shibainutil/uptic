import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useCleaningTasks, useCleaningSessions } from '../../store/cleaningStore';
import { fromISO, todayISO } from '../../lib/schedule';
import type { CleaningSession, CleaningTask } from '../../types/cleaning';
import { colors, spacing, font, radius } from '../../theme';

function dueLabel(dueDate: string): string {
  return fromISO(dueDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function PeriodicRow({ session, task, onDone, onRemove }: {
  session: CleaningSession;
  task: CleaningTask | undefined;
  onDone: () => void;
  onRemove: () => void;
}) {
  const overdue = session.dueDate < todayISO();
  const label = task ? `${task.name} · ${session.variant === 'deep' ? 'Deep clean' : 'Normal clean'}` : 'Unknown task';
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowDue, overdue && styles.rowDueOverdue]}>{dueLabel(session.dueDate)}</Text>
      </View>
      <View style={styles.rowActions}>
        <Pressable onPress={onRemove} hitSlop={8} style={styles.iconBtn}>
          <MaterialIcons name="close" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable onPress={onDone} style={styles.doneBtn}>
          <MaterialIcons name="check" size={16} color="#fff" />
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FiniteTaskCard({ task, completedCount, pending, onLog }: {
  task: CleaningTask;
  completedCount: number;
  pending: CleaningSession[];
  onLog: (count: number) => void;
}) {
  const [count, setCount] = useState(1);
  const target = task.targetSessions ?? completedCount + pending.length;
  const pct = target > 0 ? Math.min(completedCount / target, 1) : 0;
  const remaining = pending.length;
  const clamped = Math.max(1, Math.min(count, remaining));

  return (
    <View style={styles.finiteCard}>
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel}>{task.name}</Text>
        <Text style={styles.rowDue}>
          {completedCount} of {target}
          {task.targetDate ? ` · by ${fromISO(task.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
      </View>
      {remaining > 0 && (
        <View style={styles.stepperRow}>
          <Text style={styles.stepperLabel}>Logged today</Text>
          <View style={styles.stepper}>
            <Pressable onPress={() => setCount((c) => Math.max(1, c - 1))} style={styles.stepBtn} hitSlop={8}>
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepCount}>{clamped}</Text>
            <Pressable onPress={() => setCount((c) => Math.min(remaining, c + 1))} style={styles.stepBtn} hitSlop={8}>
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => { onLog(clamped); setCount(1); }} style={styles.doneBtn}>
            <MaterialIcons name="check" size={16} color="#fff" />
            <Text style={styles.doneBtnText}>Log {clamped}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function CleaningLogTab() {
  const { user } = useAuth();
  const { tasks } = useCleaningTasks(user?.uid);
  const { sessions, setStatus, remove, logFiniteSessions } = useCleaningSessions(user?.uid);

  const today = todayISO();
  const active = sessions.filter((s) => s.status !== 'completed' && !s.rescheduledTo && !s.deleted);

  // Finite tasks collapse to one progress card instead of one row per session.
  const periodicActive = active.filter((s) => s.variant);
  const finiteActive = active.filter((s) => !s.variant);

  const finiteTaskIds = [...new Set(finiteActive.map((s) => s.taskId))];
  const finiteGroups = finiteTaskIds
    .map((taskId) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return null;
      const pending = finiteActive.filter((s) => s.taskId === taskId).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const completedCount = sessions.filter(
        (s) => s.taskId === taskId && s.status === 'completed' && !s.rescheduledTo && !s.deleted,
      ).length;
      return { task, pending, completedCount };
    })
    .filter((g): g is NonNullable<typeof g> => g != null);

  const overdue = periodicActive.filter((s) => s.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dueToday = periodicActive.filter((s) => s.dueDate === today);
  const upcoming = periodicActive.filter((s) => s.dueDate > today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const nothing = finiteGroups.length === 0 && overdue.length === 0 && dueToday.length === 0 && upcoming.length === 0;

  if (nothing) {
    return (
      <View style={styles.empty}>
        <MaterialIcons name="check-circle" size={48} color={colors.textDim} />
        <Text style={styles.emptyText}>Nothing due.{'\n'}Add a task in the Tasks tab.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {finiteGroups.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>In Progress</Text>
          {finiteGroups.map(({ task, pending, completedCount }) => (
            <FiniteTaskCard
              key={task.id}
              task={task}
              pending={pending}
              completedCount={completedCount}
              onLog={(count) => logFiniteSessions(task.id, count)}
            />
          ))}
        </>
      )}

      {overdue.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Overdue</Text>
          {overdue.map((s) => (
            <PeriodicRow
              key={s.id} session={s} task={tasks.find((t) => t.id === s.taskId)}
              onDone={() => setStatus(s.id, 'completed')} onRemove={() => remove(s.id)}
            />
          ))}
        </>
      )}

      {dueToday.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Due Today</Text>
          {dueToday.map((s) => (
            <PeriodicRow
              key={s.id} session={s} task={tasks.find((t) => t.id === s.taskId)}
              onDone={() => setStatus(s.id, 'completed')} onRemove={() => remove(s.id)}
            />
          ))}
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Upcoming</Text>
          {upcoming.map((s) => (
            <PeriodicRow
              key={s.id} session={s} task={tasks.find((t) => t.id === s.taskId)}
              onDone={() => setStatus(s.id, 'completed')} onRemove={() => remove(s.id)}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  list: { padding: spacing.lg, gap: spacing.sm },
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
    marginBottom: spacing.sm,
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
  finiteCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  stepperLabel: { color: colors.textMuted, fontSize: font.sm, flex: 1 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
  },
  stepBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  stepBtnText: { color: colors.accent, fontSize: font.lg, fontWeight: '700' },
  stepCount: { color: colors.text, fontSize: font.md, fontWeight: '600', minWidth: 20, textAlign: 'center' },
});
