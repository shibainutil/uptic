import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { habitTargetProgress } from '../../lib/projectProgress';
import { ringColor } from '../ui/ProgressRing';
import { formatShortDate } from './ProjectCard';
import { isCountTarget, type HabitCriterion } from '../../types/projects';
import type { Habit, HabitLogEntry } from '../../types/habits';
import { colors, spacing, font } from '../../theme';

interface Props {
  criterion: HabitCriterion;
  habits: Habit[];
  entries: HabitLogEntry[];
  today: string;
  onPress?: () => void;
}

/**
 * A habit target on a milestone:
 * - session count: "Physio · 20 sessions", next session, when the last one falls;
 * - success rate: "Lisinopril ≥ 90 % over 4 weeks" with its current rate.
 */
export function HabitTargetRow({ criterion, habits, entries, today, onPress }: Props) {
  const p = habitTargetProgress(criterion, habits, entries, today);
  const name = p.habit?.name ?? 'Deleted habit';
  const count = isCountTarget(criterion);
  const weeks = `${criterion.windowWeeks} week${criterion.windowWeeks !== 1 ? 's' : ''}`;
  const day = (iso: string) => (iso === today ? 'today' : formatShortDate(iso));

  let title: string;
  let status: string;
  if (count) {
    title = `${name} · ${criterion.targetCount} session${criterion.targetCount !== 1 ? 's' : ''}`;
    if (criterion.metAt) status = 'Reached';
    else if (!p.habit) status = 'Habit no longer exists';
    else {
      const parts = [`${p.completed} of ${p.expected} done`];
      if (p.nextDate) parts.push(`next ${day(p.nextDate)}`);
      if (p.finishDate) parts.push(`last ${day(p.finishDate)}`);
      status = parts.join(' · ');
    }
  } else {
    title = `${name} ≥ ${criterion.targetRate}% over ${weeks}`;
    if (criterion.metAt) status = 'Reached';
    else if (!p.habit) status = 'Habit no longer exists';
    else if (!p.covered) status = `Counts in ${p.daysUntilCovered} day${p.daysUntilCovered !== 1 ? 's' : ''} (habit is newer than the window)`;
    else status = `${p.completed} of ${p.expected} sessions in the last ${weeks}`;
  }

  const showValue = !criterion.metAt && !!p.habit && p.expected > 0;
  const fill = count ? p.rate : Math.min(p.rate * 100 / criterion.targetRate, 1);

  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
      <MaterialIcons
        name={p.met ? 'check-circle' : count ? 'event-repeat' : 'loop'}
        size={22}
        color={p.met ? colors.success : colors.textMuted}
      />
      <View style={styles.main}>
        <Text style={[styles.title, p.met && styles.titleMet]} numberOfLines={1}>{title}</Text>
        <Text style={styles.sub} numberOfLines={2}>{status}</Text>
      </View>
      {showValue && (
        <Text style={[styles.rate, { color: ringColor(fill) }]}>
          {count ? `${p.completed}/${p.expected}` : `${Math.round(p.rate * 100)}%`}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  main: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: font.md },
  titleMet: { color: colors.textMuted },
  sub: { color: colors.textDim, fontSize: font.sm },
  rate: { fontSize: font.md, fontWeight: '700' },
});
