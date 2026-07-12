import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useCleaningTasks, useCleaningLogEntries } from '../../store/cleaningStore';
import { todayISO, addDays } from '../../lib/schedule';
import { countScheduledSlotsBefore, describeCleaningSchedule } from '../../lib/cleaningSchedule';
import { colors, spacing, font, radius } from '../../theme';

const LOG_CAP = 20; // sane upper bound for the "log N at once" stepper; not tied to the schedule

interface ProgressCardData {
  key: string;
  title: string;
  subtitle?: string;
  completedCount: number;
  total: number;
  onLog: (count: number) => void;
  onPress: () => void;
}

function ProgressCard({ title, subtitle, completedCount, total, onLog, onPress }: Omit<ProgressCardData, 'key'>) {
  const [count, setCount] = useState(1);
  const pct = total > 0 ? Math.min(completedCount / total, 1) : 0;
  const clamped = Math.max(1, Math.min(count, LOG_CAP));

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel}>{title}</Text>
        <Text style={styles.rowDue}>{completedCount} of {total}{subtitle ? ` · ${subtitle}` : ''}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
      </View>
      <View style={styles.stepperRow}>
        <Text style={styles.stepperLabel}>Log sessions</Text>
        <View style={styles.stepper}>
          <Pressable onPress={() => setCount((c) => Math.max(1, c - 1))} style={styles.stepBtn} hitSlop={8}>
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.stepCount}>{clamped}</Text>
          <Pressable onPress={() => setCount((c) => Math.min(LOG_CAP, c + 1))} style={styles.stepBtn} hitSlop={8}>
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => { onLog(clamped); setCount(1); }} style={styles.doneBtn}>
          <MaterialIcons name="check" size={16} color="#fff" />
          <Text style={styles.doneBtnText}>Log {clamped}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export function CleaningLogTab() {
  const router = useRouter();
  const { user } = useAuth();
  const { tasks } = useCleaningTasks(user?.uid);
  const { entries, addMany } = useCleaningLogEntries(user?.uid);

  const today = todayISO();
  const tomorrow = addDays(today, 1);

  // Finite tasks: one tile per task, progress against its fixed target count.
  const finiteGroups: ProgressCardData[] = tasks
    .filter((t) => t.kind === 'finite')
    .map((task): ProgressCardData => {
      const taskEntries = entries.filter((e) => e.taskId === task.id && !e.variant);
      const completedCount = taskEntries.length;
      const total = task.targetSessions ?? completedCount;
      return {
        key: task.id,
        title: task.name,
        subtitle: task.targetDate
          ? `by ${new Date(task.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
          : undefined,
        completedCount,
        total,
        onLog: (count) => addMany(task.id, undefined, count),
        onPress: () => router.push(`/cleaning/entries/${task.id}`),
      };
    });

  // Periodic tasks: one tile per (task, variant) — normal and deep clean track separately.
  // Progress reflects only sessions scheduled before tomorrow, since the recurrence
  // itself never ends; logging is freeform (can happen on or off schedule) and always
  // available, so the log action never disappears once "done for today".
  const periodicGroups: ProgressCardData[] = tasks
    .filter((t) => t.kind === 'periodic')
    .flatMap((task): ProgressCardData[] => {
      const variants: Array<{ variant: 'normal' | 'deep'; schedule: typeof task.normalSchedule }> = [
        { variant: 'normal', schedule: task.normalSchedule },
        { variant: 'deep', schedule: task.deepSchedule },
      ];
      return variants
        .filter((v): v is { variant: 'normal' | 'deep'; schedule: NonNullable<typeof v.schedule> } => Boolean(v.schedule))
        .map(({ variant, schedule }) => {
          const total = countScheduledSlotsBefore(schedule, task.startDate, tomorrow);
          const completedCount = entries.filter(
            (e) => e.taskId === task.id && e.variant === variant && e.loggedAt < tomorrow,
          ).length;
          return {
            key: `${task.id}::${variant}`,
            title: `${task.name} · ${variant === 'deep' ? 'Deep clean' : 'Normal clean'}`,
            subtitle: describeCleaningSchedule(schedule),
            completedCount: Math.min(completedCount, total),
            total,
            onLog: (count) => addMany(task.id, variant, count),
            onPress: () => router.push({ pathname: '/cleaning/entries/[taskId]', params: { taskId: task.id, variant } }),
          };
        });
    });

  if (finiteGroups.length === 0 && periodicGroups.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialIcons name="check-circle" size={48} color={colors.textDim} />
        <Text style={styles.emptyText}>Nothing to log yet.{'\n'}Add a task in the Tasks tab.</Text>
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
