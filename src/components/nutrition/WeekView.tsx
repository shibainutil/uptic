import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FastingGoalsModal } from './FastingDialogs';
import { colors, spacing, font, radius } from '../../theme';
import { addDays, todayISO } from '../../lib/schedule';
import { fastingHoursOverlappingDay } from '../../lib/fasting';
import type { FastingSession, NutritionData, NutritionSettings } from '../../types/nutrition';
import { entriesForDate, sumMacros } from '../../types/nutrition';

interface Props {
  weekStart: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  entries: NutritionData[];
  sessions: FastingSession[];
  settings: NutritionSettings;
  onSaveSettings: (patch: Partial<NutritionSettings>) => Promise<unknown>;
  onSelectDay: (dateISO: string) => void;
}

function pctChange(cur: number, prev: number): number {
  if (prev <= 0) return 0;
  return ((cur - prev) / prev) * 100;
}

export function WeekView({ weekStart, onPrevWeek, onNextWeek, entries, sessions, settings, onSaveSettings, onSelectDay }: Props) {
  const [goalsOpen, setGoalsOpen] = useState(false);
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = days[6];

  function label(iso: string) {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function labelYear(iso: string) {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <View style={styles.root}>
      <View style={styles.navBar}>
        <Pressable onPress={onPrevWeek} hitSlop={8}><MaterialIcons name="chevron-left" size={26} color={colors.text} /></Pressable>
        <View style={styles.navCenter}>
          <Text style={styles.navTitle}>{label(weekStart)} – {labelYear(weekEnd)}</Text>
          <Pressable style={styles.goalsRow} onPress={() => setGoalsOpen(true)}>
            <MaterialIcons name="flag" size={12} color={colors.textMuted} />
            <Text style={styles.goalsText}>Goals: {settings.dailyFastingGoalHours}h / {settings.bonusFastingGoalHours}h</Text>
          </Pressable>
        </View>
        <Pressable onPress={onNextWeek} hitSlop={8}><MaterialIcons name="chevron-right" size={26} color={colors.text} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {days.map((d, i) => {
          const dayTotals = sumMacros(entriesForDate(entries, d));
          const prevTotals = i > 0 ? sumMacros(entriesForDate(entries, days[i - 1])) : null;
          const change = prevTotals ? pctChange(dayTotals.calories, prevTotals.calories) : null;
          const fastingHours = fastingHoursOverlappingDay(sessions, d);
          const isToday = d === today;
          return (
            <Pressable key={d} style={[styles.dayCard, isToday && styles.dayCardToday]} onPress={() => onSelectDay(d)}>
              <View style={styles.dayLeft}>
                <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>{new Date(`${d}T00:00:00`).getDate()}</Text>
                <Text style={styles.dayWeekday}>{new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</Text>
              </View>
              <View style={styles.dayMid}>
                <View style={styles.fastTrack}>
                  <View style={[styles.fastFill, { width: `${Math.min(100, (fastingHours / 24) * 100)}%` }]} />
                </View>
                <Text style={styles.fastLabel}>{fastingHours > 0 ? `${fastingHours.toFixed(1)}h fasted` : 'No fast'}</Text>
              </View>
              <View style={styles.dayRight}>
                <Text style={styles.calValue}>{Math.round(dayTotals.calories)} kcal</Text>
                {change != null && (
                  <Text style={[styles.calChange, change > 0 ? styles.calUp : change < 0 ? styles.calDown : styles.calFlat]}>
                    {Math.abs(change) < 1 ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(0)}%`}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <FastingGoalsModal visible={goalsOpen} onClose={() => setGoalsOpen(false)} settings={settings} onSave={onSaveSettings} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  navCenter: { alignItems: 'center', gap: 2 },
  navTitle: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  goalsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  goalsText: { color: colors.textMuted, fontSize: 11 },
  scroll: { padding: spacing.lg, gap: spacing.sm },
  dayCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.surface2,
    padding: spacing.md, height: 78,
  },
  dayCardToday: { borderColor: '#FB8C00', backgroundColor: 'rgba(251,140,0,0.08)' },
  dayLeft: { width: 44, alignItems: 'center' },
  dayNum: { color: colors.text, fontSize: 20, fontWeight: '700' },
  dayNumToday: { color: '#FB8C00' },
  dayWeekday: { color: colors.textDim, fontSize: 10 },
  dayMid: { flex: 1, gap: 6 },
  fastTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  fastFill: { height: '100%', backgroundColor: '#FB8C00', borderRadius: 3 },
  fastLabel: { color: colors.textDim, fontSize: 11 },
  dayRight: { alignItems: 'flex-end', gap: 2, minWidth: 80 },
  calValue: { color: colors.text, fontSize: font.sm, fontWeight: '700' },
  calChange: { fontSize: 11, fontWeight: '600' },
  calUp: { color: colors.success },
  calDown: { color: colors.danger },
  calFlat: { color: colors.textDim },
});
