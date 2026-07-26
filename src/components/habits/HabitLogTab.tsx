import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../store/habitStore';
import { todayISO, fromISO, diffDays } from '../../lib/schedule';
import { computeRing, describeSchedule } from '../../lib/habitSchedule';
import { isHabitComplete, totalSessions, type Habit, type HabitLogEntry } from '../../types/habits';
import { ringColor, describeArc } from '../ui/ProgressRing';
import { Badge } from '../ui/Badge';
import { LogEntryModal } from './LogEntryModal';
import { colors, spacing, font, radius } from '../../theme';

const EXPANDED_ENTRY_LIMIT = 10;
const ICON_SIZE = 16;
const LIMITED_COLOR = '#A855F7';
const WARNING_COLOR = '#EAB308';
const RING_SIZE = 88;
const SEGMENTS = 32;

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
      <View style={styles.grid}>
        {active.map(({ habit, completedCount, habitEntries }) => {
          const allTimeRate = computeRing(habit, entries, 'allTime', today).rate;
          const sessionRate =
            habit.kind === 'limited' && habit.targetSessions != null
              ? Math.min(completedCount / habit.targetSessions, 1)
              : allTimeRate;

          let timeRate: number | undefined;
          if (habit.kind === 'limited' && habit.targetDate != null) {
            const total = Math.max(1, diffDays(habit.targetDate, habit.startDate));
            const elapsed = Math.min(Math.max(0, diffDays(today, habit.startDate)), total);
            timeRate = elapsed / total;
          }

          return (
            <HabitCard
              key={habit.id}
              habit={habit}
              completedCount={completedCount}
              sessionRate={sessionRate}
              timeRate={timeRate}
              entries={habitEntries}
              onAdd={add}
              onPress={() => router.push(`/habits/entries/${habit.id}`)}
            />
          );
        })}
      </View>

      {completed.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Completed</Text>
          {completed.map(({ habit, completedCount }) => (
            <Pressable key={habit.id} style={styles.completedRow} onPress={() => router.push(`/habits/entries/${habit.id}`)}>
              <MaterialIcons name="check-circle" size={20} color={colors.success} />
              <View style={styles.rowMain}>
                <Text style={styles.rowLabel}>{habit.name}</Text>
                <Text style={styles.rowDue}>
                  {completedCount} of {habit.targetSessions ?? completedCount} completed
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function HabitCard({ habit, completedCount, sessionRate, timeRate, entries, onAdd, onPress }: {
  habit: Habit;
  completedCount: number;
  sessionRate: number;
  timeRate?: number;
  entries: HabitLogEntry[];
  onAdd: (data: Omit<HabitLogEntry, 'id' | 'createdAt'>) => void;
  onPress: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const today = todayISO();
  const sortedEntries = entries.slice().sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const shown = sortedEntries.slice(0, EXPANDED_ENTRY_LIMIT);
  const daysLeft = habit.targetDate ? Math.max(0, diffDays(habit.targetDate, today)) : null;

  let paceStatus: { label: string; color: string } | null = null;
  if (timeRate != null && habit.targetSessions != null) {
    const expectedByNow = Math.ceil(timeRate * habit.targetSessions);
    const deficit = expectedByNow - completedCount;
    if (sessionRate >= 1)        paceStatus = { label: 'Goal reached', color: colors.success };
    else if (deficit <= 0)       paceStatus = { label: 'On pace', color: colors.success };
    else if (deficit === 1)      paceStatus = { label: '1 behind', color: WARNING_COLOR };
    else                         paceStatus = { label: `${deficit} behind`, color: colors.danger };
  }

  return (
    <View style={styles.card}>
      {/* Title + badges + buttons */}
      <View style={styles.headerRow}>
        <Pressable style={styles.headerMain} onPress={onPress}>
          <Text style={styles.title} numberOfLines={2}>{habit.name}</Text>
          <View style={styles.badgeRow}>
            <Badge
              color={colors.accent}
              label={describeSchedule(habit.schedule)}
              icon={<MaterialIcons name="event-repeat" size={10} color={colors.accent} />}
            />
            {habit.kind === 'limited' && habit.targetDate && (
              <Badge
                color={LIMITED_COLOR}
                label={`by ${fromISO(habit.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                icon={<MaterialIcons name="flag" size={10} color={LIMITED_COLOR} />}
              />
            )}
          </View>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setExpanded((v) => !v)} style={[styles.iconBtn, styles.listBtn]}>
            <MaterialIcons name="format-list-bulleted" size={ICON_SIZE} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={() => setModalOpen(true)} style={[styles.iconBtn, styles.addBtn]}>
            <MaterialIcons name="add" size={ICON_SIZE} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Ring */}
      <View style={styles.ringArea}>
        <View style={{ width: RING_SIZE, height: RING_SIZE }}>
          <ConcentricRing sessionRate={sessionRate} timeRate={timeRate} size={RING_SIZE} />
          <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
            <Text style={styles.ringPct}>{Math.round(sessionRate * 100)}%</Text>
          </View>
        </View>

        <View style={styles.ringMeta}>
          {paceStatus && (
            <Text style={[styles.paceLabel, { color: paceStatus.color }]}>{paceStatus.label}</Text>
          )}
          {daysLeft != null && (
            <Text style={styles.daysLeft}>
              {daysLeft > 0 ? `${daysLeft}d left` : 'Overdue'}
            </Text>
          )}
          {habit.kind === 'limited' && habit.targetSessions != null && (
            <Text style={styles.countLabel}>{completedCount} / {habit.targetSessions}</Text>
          )}
        </View>
      </View>

      {/* Expanded session list */}
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
              {sortedEntries.length > EXPANDED_ENTRY_LIMIT
                ? `View all ${sortedEntries.length} sessions`
                : 'Manage sessions'}
            </Text>
            <MaterialIcons name="chevron-right" size={16} color={colors.accent} />
          </Pressable>
        </View>
      )}

      <LogEntryModal
        visible={modalOpen}
        onSave={(loggedAt, notes, count) => {
          onAdd({ habitId: habit.id, loggedAt, notes: notes || undefined, count });
          setModalOpen(false);
        }}
        onClose={() => setModalOpen(false)}
      />
    </View>
  );
}

function ConcentricRing({ sessionRate, timeRate, size }: {
  sessionRate: number;
  timeRate?: number;
  size: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const OUTER_W = 9;
  const INNER_W = 6;
  const GAP = 5;

  const outerR = size / 2 - OUTER_W / 2 - 1;
  const innerR = outerR - OUTER_W / 2 - GAP - INNER_W / 2;

  const clamped = Math.max(0, Math.min(sessionRate, 1));
  const step = 360 / SEGMENTS;
  const filled = Math.round(clamped * SEGMENTS);
  const deadlineAngle = timeRate != null ? Math.min(timeRate, 0.9999) * 360 : null;

  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={outerR} stroke={colors.surface2} strokeWidth={OUTER_W} fill="none" />
      {Array.from({ length: filled }, (_, i) => (
        <Path
          key={i}
          d={describeArc(cx, cy, outerR, i * step, (i + 1) * step)}
          stroke={ringColor(i / SEGMENTS)}
          strokeWidth={OUTER_W}
          strokeLinecap="round"
          fill="none"
        />
      ))}
      {timeRate != null && (
        <Circle cx={cx} cy={cy} r={innerR} stroke={colors.surface2} strokeWidth={INNER_W} fill="none" />
      )}
      {deadlineAngle != null && deadlineAngle > 0 && (
        <Path
          d={describeArc(cx, cy, innerR, 0, deadlineAngle)}
          stroke={colors.accent}
          strokeWidth={INNER_W}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  list: { padding: spacing.md, gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionHeader: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  card: {
    width: '48.6%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  headerMain: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: font.sm, fontWeight: '600', lineHeight: 17 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  headerActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  listBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  addBtn: { backgroundColor: colors.accent },
  ringArea: { alignItems: 'center', gap: 6 },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringPct: { color: colors.text, fontSize: 15, fontWeight: '700' },
  ringMeta: { alignItems: 'center', gap: 2 },
  paceLabel: { fontSize: 11, fontWeight: '600' },
  daysLeft: { color: colors.textDim, fontSize: 11 },
  countLabel: { color: colors.textMuted, fontSize: 11 },
  completedRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.surface2,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  rowMain: { flex: 1, gap: 3 },
  rowLabel: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  rowDue: { color: colors.textDim, fontSize: font.sm },
  entriesList: {
    gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.surface2, paddingTop: spacing.sm,
  },
  noEntriesText: { color: colors.textDim, fontSize: font.sm },
  entryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm, paddingVertical: 2,
  },
  entryDate: { color: colors.text, fontSize: 11, flex: 1 },
  entryNotes: { color: colors.textDim, fontSize: 11, flexShrink: 1, textAlign: 'right' },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: spacing.xs },
  viewAllText: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
});
