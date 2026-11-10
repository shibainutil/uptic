import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { habitTargetProgress } from '../../lib/projectProgress';
import { ringColor } from '../ui/ProgressRing';
import type { HabitCriterion } from '../../types/projects';
import type { Habit, HabitLogEntry } from '../../types/habits';
import { colors, spacing, font } from '../../theme';

interface Props {
  criterion: HabitCriterion;
  habits: Habit[];
  entries: HabitLogEntry[];
  today: string;
  onPress?: () => void;
}

/** "Lisinopril ≥ 90 % over 4 weeks" with its current rate, a met tick, or how long until it can count. */
export function HabitTargetRow({ criterion, habits, entries, today, onPress }: Props) {
  const p = habitTargetProgress(criterion, habits, entries, today);
  const name = p.habit?.name ?? 'Deleted habit';
  const weeks = `${criterion.windowWeeks} week${criterion.windowWeeks !== 1 ? 's' : ''}`;
  let status: string;
  if (criterion.metAt) status = 'Reached';
  else if (!p.habit) status = 'Habit no longer exists';
  else if (!p.covered) status = `Counts in ${p.daysUntilCovered} day${p.daysUntilCovered !== 1 ? 's' : ''} (habit is newer than the window)`;
  else status = `${p.completed} of ${p.expected} sessions in the last ${weeks}`;

  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
      <MaterialIcons
        name={p.met ? 'check-circle' : 'loop'}
        size={22}
        color={p.met ? colors.success : colors.textMuted}
      />
      <View style={styles.main}>
        <Text style={[styles.title, p.met && styles.titleMet]} numberOfLines={1}>
          {name} ≥ {criterion.targetRate}% over {weeks}
        </Text>
        <Text style={styles.sub} numberOfLines={2}>{status}</Text>
      </View>
      {!criterion.metAt && p.habit && p.expected > 0 && (
        <Text style={[styles.rate, { color: ringColor(Math.min(p.rate * 100 / criterion.targetRate, 1)) }]}>
          {Math.round(p.rate * 100)}%
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
