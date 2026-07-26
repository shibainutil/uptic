import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle, Path, Line } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../store/habitStore';
import { todayISO, fromISO, diffDays } from '../../lib/schedule';
import { computeRing, describeSchedule } from '../../lib/habitSchedule';
import { isHabitComplete, totalSessions, type Habit, type HabitLogEntry } from '../../types/habits';
import { ringColor, polarToCartesian, describeArc } from '../ui/ProgressRing';
import { Badge } from '../ui/Badge';
import { LogEntryModal } from './LogEntryModal';
import { colors, spacing, font, radius } from '../../theme';

const EXPANDED_ENTRY_LIMIT = 10;
const ICON_SIZE = 18;
const LIMITED_COLOR = '#A855F7';
const WARNING_COLOR = '#EAB308';
const RING_SIZE = 120;
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
    if (sessionRate >= 1) {
      paceStatus = { label: 'Goal reached', color: colors.success };
    } else if (deficit <= 0) {
      paceStatus = { label: 'On pace', color: colors.success };
    } else if (deficit === 1) {
      paceStatus = { label: '1 session behind', color: WARNING_COLOR };
    } else {
      paceStatus = { label: `${deficit} sessions behind`, color: colors.danger };
    }
  }

  return (
    <View style={styles.card}>
      {/* Title + badges (tight group) + action buttons */}
      <View style={styles.headerRow}>
        <Pressable style={styles.headerMain} onPress={onPress}>
          <Text style={styles.title}>{habit.name}</Text>
          <View style={styles.badgeRow}>
            <Badge
              color={colors.accent}
              label={describeSchedule(habit.schedule)}
              icon={<MaterialIcons name="event-repeat" size={11} color={colors.accent} />}
            />
            {habit.kind === 'limited' && habit.targetDate && (
              <Badge
                color={LIMITED_COLOR}
                label={`by ${fromISO(habit.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                icon={<MaterialIcons name="flag" size={11} color={LIMITED_COLOR} />}
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

      {/* Concentric ring + status */}
      <View style={styles.ringArea}>
        <ConcentricRing
          sessionRate={sessionRate}
          timeRate={timeRate}
          paceRate={timeRate}
          size={RING_SIZE}
        />
        <View style={styles.ringLabels}>
          <Text style={styles.ringPct}>
            {habit.kind === 'limited' && habit.targetSessions != null
              ? `${completedCount} / ${habit.targetSessions}`
              : `${Math.round(sessionRate * 100)}%`}
          </Text>
          {paceStatus && (
            <Text style={[styles.paceLabel, { color: paceStatus.color }]}>{paceStatus.label}</Text>
          )}
          {daysLeft != null && (
            <Text style={styles.daysLeft}>
              {daysLeft > 0 ? `${daysLeft} days left` : 'Deadline passed'}
            </Text>
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
            <MaterialIcons name="chevron-right" size={18} color={colors.accent} />
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

function ConcentricRing({ sessionRate, timeRate, paceRate, size }: {
  sessionRate: number;
  timeRate?: number;
  paceRate?: number;
  size: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const OUTER_W = 11;
  const INNER_W = 7;
  const GAP = 6;

  const outerR = size / 2 - OUTER_W / 2 - 1;
  const innerR = outerR - OUTER_W / 2 - GAP - INNER_W / 2;

  const clamped = Math.max(0, Math.min(sessionRate, 1));
  const step = 360 / SEGMENTS;
  const filled = Math.round(clamped * SEGMENTS);

  const deadlineAngle = timeRate != null ? Math.min(timeRate, 0.9999) * 360 : null;

  let paceLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (paceRate != null) {
    const angle = Math.min(paceRate, 0.9999) * 360;
    const rad = ((angle - 90) * Math.PI) / 180;
    const r1 = outerR - OUTER_W / 2 - 1;
    const r2 = outerR + OUTER_W / 2 + 2;
    paceLine = {
      x1: cx + r1 * Math.cos(rad), y1: cy + r1 * Math.sin(rad),
      x2: cx + r2 * Math.cos(rad), y2: cy + r2 * Math.sin(rad),
    };
  }

  return (
    <Svg width={size} height={size}>
      {/* Outer track */}
      <Circle cx={cx} cy={cy} r={outerR} stroke={colors.surface2} strokeWidth={OUTER_W} fill="none" />

      {/* Session arc segments */}
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

      {/* Inner deadline track */}
      {timeRate != null && (
        <Circle cx={cx} cy={cy} r={innerR} stroke={colors.surface2} strokeWidth={INNER_W} fill="none" />
      )}

      {/* Inner deadline arc */}
      {deadlineAngle != null && deadlineAngle > 0 && (
        <Path
          d={describeArc(cx, cy, innerR, 0, deadlineAngle)}
          stroke={colors.accent}
          strokeWidth={INNER_W}
          strokeLinecap="round"
          fill="none"
        />
      )}

      {/* Pace marker — dotted radial line crossing the outer ring */}
      {paceLine && (
        <Line
          x1={paceLine.x1} y1={paceLine.y1}
          x2={paceLine.x2} y2={paceLine.y2}
          stroke={colors.textMuted}
          strokeWidth={2}
          strokeDasharray="2,2"
        />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  list: { padding: spacing.lg, gap: spacing.md },
  sectionHeader: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: spacing.xs, marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md ?? radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headerMain: { flex: 1, gap: 5 },
  title: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: 2 },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  listBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  addBtn: { backgroundColor: colors.accent },
  ringArea: { alignItems: 'center', gap: spacing.xs },
  ringLabels: { alignItems: 'center', gap: 3 },
  ringPct: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  paceLabel: { fontSize: font.sm, fontWeight: '600' },
  daysLeft: { color: colors.textDim, fontSize: font.sm },
  completedRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface2,
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
    gap: spacing.md, paddingVertical: spacing.xs,
  },
  entryDate: { color: colors.text, fontSize: font.sm },
  entryNotes: { color: colors.textDim, fontSize: font.sm, flexShrink: 1, textAlign: 'right' },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: spacing.xs },
  viewAllText: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
});
