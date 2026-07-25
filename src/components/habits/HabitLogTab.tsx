import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../store/habitStore';
import { todayISO, fromISO } from '../../lib/schedule';
import { computeRing, describeSchedule, type RingPeriod } from '../../lib/habitSchedule';
import { isHabitComplete, totalSessions, type HabitLogEntry } from '../../types/habits';
import { ProgressRing } from '../ui/ProgressRing';
import { LogEntryModal } from './LogEntryModal';
import { colors, spacing, font, radius } from '../../theme';

const EXPANDED_ENTRY_LIMIT = 10;

const RING_PERIODS: { period: RingPeriod; label: string }[] = [
  { period: 'day', label: 'Day' },
  { period: 'week', label: 'Week' },
  { period: 'month', label: 'Month' },
  { period: 'quarter', label: 'Qtr' },
  { period: 'year', label: 'Year' },
  { period: 'allTime', label: 'All' },
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function HabitLogTab() {
  const router = useRouter();
  const { user } = useAuth();
  const { habits } = useHabits(user?.uid);
  const { entries, add } = useHabitLogEntries(user?.uid);

  const today = todayISO();

  const withProgress = habits.map((habit) => {
    const habitEntries = entries.filter((e) => e.habitId === habit.id);
    const completedCount = totalSessions(habitEntries);
    return { habit, completedCount, habitEntries, complete: isHabitComplete(habit, completedCount, today) };
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
      {active.map(({ habit, completedCount, habitEntries }) => (
        <HabitCard
          key={habit.id}
          habitId={habit.id}
          title={habit.name}
          subtitle={habit.kind === 'limited'
            ? `${completedCount} of ${habit.targetSessions ?? '∞'}${habit.targetDate ? ` · by ${fromISO(habit.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}`
            : describeSchedule(habit.schedule)}
          rings={RING_PERIODS.map(({ period, label }) => ({ label, ...computeRing(habit, entries, period, today) }))}
          entries={habitEntries}
          onAdd={add}
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

function HabitCard({ habitId, title, subtitle, rings, entries, onAdd, onPress }: {
  habitId: string;
  title: string;
  subtitle: string;
  rings: Array<{ label: string; rate: number }>;
  entries: HabitLogEntry[];
  onAdd: (data: Omit<HabitLogEntry, 'id' | 'createdAt'>) => void;
  onPress: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const sortedEntries = entries.slice().sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const shown = sortedEntries.slice(0, EXPANDED_ENTRY_LIMIT);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Pressable style={styles.rowMain} onPress={onPress}>
          <Text style={styles.rowLabel}>{title}</Text>
          <Text style={styles.rowDue}>{subtitle}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setExpanded((v) => !v)} style={styles.pillBtn}>
            <MaterialIcons name="format-list-bulleted" size={15} color={colors.textMuted} />
            <Text style={styles.pillBtnText}>{expanded ? 'Hide' : 'Sessions'}</Text>
          </Pressable>
          <Pressable onPress={() => setModalOpen(true)} style={styles.addPillBtn}>
            <MaterialIcons name="add" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      <View style={styles.ringsRow}>
        {rings.map((r) => (
          <ProgressRing key={r.label} rate={r.rate} label={r.label} size={44} strokeWidth={4} />
        ))}
      </View>

      {expanded && (
        <View style={styles.entriesList}>
          {shown.length === 0 ? (
            <Text style={styles.noEntriesText}>No sessions logged yet.</Text>
          ) : (
            shown.map((e) => (
              <View key={e.id} style={styles.entryRow}>
                <Text style={styles.entryDate}>
                  {formatDateTime(e.loggedAt)}{e.count && e.count > 1 ? ` · ×${e.count}` : ''}
                </Text>
                {e.notes ? <Text style={styles.entryNotes} numberOfLines={1}>{e.notes}</Text> : null}
              </View>
            ))
          )}
          <Pressable onPress={onPress} style={styles.viewAllBtn}>
            <Text style={styles.viewAllText}>
              {sortedEntries.length > EXPANDED_ENTRY_LIMIT ? `View all ${sortedEntries.length} sessions` : 'Manage sessions'}
            </Text>
            <MaterialIcons name="chevron-right" size={18} color={colors.accent} />
          </Pressable>
        </View>
      )}

      <LogEntryModal
        visible={modalOpen}
        onSave={(loggedAt, notes, count) => {
          onAdd({ habitId, loggedAt, notes: notes || undefined, count });
          setModalOpen(false);
        }}
        onClose={() => setModalOpen(false)}
      />
    </View>
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
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pillBtnText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  addPillBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    padding: spacing.xs + 1,
  },
  rowMain: { flex: 1, gap: 4 },
  rowLabel: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  rowDue: { color: colors.textDim, fontSize: font.sm },
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
  entriesList: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.surface2,
    paddingTop: spacing.sm,
  },
  noEntriesText: { color: colors.textDim, fontSize: font.sm },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  entryDate: { color: colors.text, fontSize: font.sm },
  entryNotes: { color: colors.textDim, fontSize: font.sm, flexShrink: 1, textAlign: 'right' },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingTop: spacing.xs,
  },
  viewAllText: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
});
