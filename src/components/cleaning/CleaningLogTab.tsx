import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useCleaningTasks, useCleaningSessions } from '../../store/cleaningStore';
import { fromISO, todayISO, addDays } from '../../lib/schedule';
import { describeCleaningSchedule } from '../../lib/cleaningSchedule';
import type { CleaningSession } from '../../types/cleaning';
import { colors, spacing, font, radius } from '../../theme';

interface ProgressCardData {
  key: string;
  title: string;
  subtitle?: string;
  completedCount: number;
  total: number;
  remaining: number;
  onLog: (count: number) => void;
}

function ProgressCard({ title, subtitle, completedCount, total, remaining, onLog }: Omit<ProgressCardData, 'key'>) {
  const [count, setCount] = useState(1);
  const pct = total > 0 ? Math.min(completedCount / total, 1) : 0;
  const clamped = Math.max(1, Math.min(count, remaining));

  return (
    <View style={styles.card}>
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel}>{title}</Text>
        <Text style={styles.rowDue}>{completedCount} of {total}{subtitle ? ` · ${subtitle}` : ''}</Text>
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

function isActive(s: CleaningSession): boolean {
  return s.status !== 'completed' && !s.rescheduledTo && !s.deleted;
}

export function CleaningLogTab() {
  const { user } = useAuth();
  const { tasks } = useCleaningTasks(user?.uid);
  const { sessions, logSessions } = useCleaningSessions(user?.uid);

  const today = todayISO();
  const tomorrow = addDays(today, 1);

  // Finite tasks: one tile per task, progress against its fixed target count.
  const finiteTaskIds = [...new Set(sessions.filter((s) => !s.variant && isActive(s)).map((s) => s.taskId))];
  const finiteGroups: ProgressCardData[] = finiteTaskIds
    .map((taskId): ProgressCardData | null => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return null;
      const pending = sessions.filter((s) => s.taskId === taskId && !s.variant && isActive(s));
      const completedCount = sessions.filter(
        (s) => s.taskId === taskId && !s.variant && s.status === 'completed' && !s.rescheduledTo && !s.deleted,
      ).length;
      const total = task.targetSessions ?? completedCount + pending.length;
      return {
        key: task.id,
        title: task.name,
        subtitle: task.targetDate
          ? `by ${fromISO(task.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
          : undefined,
        completedCount,
        total,
        remaining: pending.length,
        onLog: (count) => logSessions(task.id, undefined, count),
      };
    })
    .filter((g): g is ProgressCardData => g != null);

  // Periodic tasks: one tile per (task, variant) — normal and deep clean track separately.
  // Progress reflects only sessions scheduled before tomorrow (i.e. due by today), since
  // the recurrence never ends and future occurrences aren't "graded" yet.
  const periodicKeys = [...new Set(
    sessions.filter((s) => s.variant && !s.rescheduledTo && !s.deleted).map((s) => `${s.taskId}::${s.variant}`),
  )];
  const periodicGroups: ProgressCardData[] = periodicKeys
    .map((key): ProgressCardData | null => {
      const [taskId, variant] = key.split('::') as [string, 'normal' | 'deep'];
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return null;
      const all = sessions.filter((s) => s.taskId === taskId && s.variant === variant && !s.rescheduledTo && !s.deleted);
      const before = all.filter((s) => s.dueDate < tomorrow);
      if (before.length === 0) return null;
      const completedCount = before.filter((s) => s.status === 'completed').length;
      const remaining = before.filter((s) => s.status !== 'completed').length;
      const schedule = variant === 'deep' ? task.deepSchedule : task.normalSchedule;
      return {
        key,
        title: `${task.name} · ${variant === 'deep' ? 'Deep clean' : 'Normal clean'}`,
        subtitle: schedule ? describeCleaningSchedule(schedule) : undefined,
        completedCount,
        total: before.length,
        remaining,
        onLog: (count) => logSessions(taskId, variant, count),
      };
    })
    .filter((g): g is ProgressCardData => g != null);

  if (finiteGroups.length === 0 && periodicGroups.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialIcons name="check-circle" size={48} color={colors.textDim} />
        <Text style={styles.emptyText}>Nothing due.{'\n'}Add a task in the Tasks tab.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {periodicGroups.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Recurring</Text>
          {periodicGroups.map(({ key, ...g }) => <ProgressCard key={key} {...g} />)}
        </>
      )}

      {finiteGroups.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>In Progress</Text>
          {finiteGroups.map(({ key, ...g }) => <ProgressCard key={key} {...g} />)}
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
  rowMain: { flex: 1, gap: 4 },
  rowLabel: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  rowDue: { color: colors.textDim, fontSize: font.sm },
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
  card: {
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
