import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../store/habitStore';
import { todayISO, fromISO } from '../../lib/schedule';
import { computeRing, describeSchedule, type RingPeriod } from '../../lib/habitSchedule';
import { isHabitComplete } from '../../types/habits';
import { ProgressRing } from '../ui/ProgressRing';
import { colors, spacing, font, radius } from '../../theme';

const LOG_CAP = 20; // sane upper bound for the "log N at once" stepper; not tied to the schedule

const RING_PERIODS: { period: RingPeriod; label: string }[] = [
  { period: 'day', label: 'Day' },
  { period: 'week', label: 'Week' },
  { period: 'month', label: 'Month' },
  { period: 'quarter', label: 'Qtr' },
  { period: 'year', label: 'Year' },
  { period: 'allTime', label: 'All' },
];

export function HabitLogTab() {
  const router = useRouter();
  const { user } = useAuth();
  const { habits } = useHabits(user?.uid);
  const { entries, addMany } = useHabitLogEntries(user?.uid);

  const today = todayISO();

  const withProgress = habits.map((habit) => {
    const completedCount = entries.filter((e) => e.habitId === habit.id).length;
    return { habit, completedCount, complete: isHabitComplete(habit, completedCount, today) };
  });
  const active = withProgress.filter((h) => !h.complete);
  const completed = withProgress.filter((h) => h.complete);

  if (active.length === 0 && completed.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialIcons name="check-circle" size={48} color={colors.textDim} />
        <Text style={styles.emptyText}>No habits yet.{'\n'}Add one in the Habits tab.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {active.map(({ habit, completedCount }) => (
        <HabitCard
          key={habit.id}
          title={habit.name}
          subtitle={habit.kind === 'limited'
            ? `${completedCount} of ${habit.targetSessions ?? '∞'}${habit.targetDate ? ` · by ${fromISO(habit.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}`
            : describeSchedule(habit.schedule)}
          rings={RING_PERIODS.map(({ period, label }) => ({ label, ...computeRing(habit, entries, period, today) }))}
          onLog={(count) => addMany(habit.id, count)}
          onPress={() => router.push(`/habits/entries/${habit.id}`)}
        />
      ))}

      {completed.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Completed</Text>
          {completed.map(({ habit, completedCount }) => (
            <Pressable key={habit.id} style={styles.completedRow} onPress={() => router.push(`/habits/entries/${habit.id}`)}>
              <MaterialIcons name="check-circle" size={20} color={colors.success} />
              <View style={styles.rowMain}>
                <Text style={styles.rowLabel}>{habit.name}</Text>
                <Text style={styles.rowDue}>{completedCount} of {habit.targetSessions ?? completedCount} completed</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function HabitCard({ title, subtitle, rings, onLog, onPress }: {
  title: string;
  subtitle: string;
  rings: Array<{ label: string; rate: number }>;
  onLog: (count: number) => void;
  onPress: () => void;
}) {
  const [count, setCount] = useState(1);
  const clamped = Math.max(1, Math.min(count, LOG_CAP));

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel}>{title}</Text>
        <Text style={styles.rowDue}>{subtitle}</Text>
      </View>

      <View style={styles.ringsRow}>
        {rings.map((r) => (
          <ProgressRing key={r.label} rate={r.rate} label={r.label} size={44} strokeWidth={4} />
        ))}
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
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
});
