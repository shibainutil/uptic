import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LogMealModal } from './LogMealModal';
import { colors, spacing, font, radius } from '../../theme';
import { toISO, fromISO } from '../../lib/schedule';
import type { Ingredient, NutritionData, NutritionSettings } from '../../types/nutrition';
import { entriesForDate, sumMacros } from '../../types/nutrition';

interface Props {
  monthStart: string; // ISO first-of-month
  onPrevMonth: () => void;
  onNextMonth: () => void;
  entries: NutritionData[];
  settings: NutritionSettings;
  ingredients: Ingredient[];
  onSaveMeal: (data: Omit<NutritionData, 'id' | 'createdAt'>) => Promise<unknown>;
}

function monthDates(monthStartISO: string): string[] {
  const d = fromISO(monthStartISO);
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => toISO(new Date(year, month, i + 1)));
}

export function MonthView({ monthStart, onPrevMonth, onNextMonth, entries, settings, ingredients, onSaveMeal }: Props) {
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const dates = monthDates(monthStart);
  const monthLabel = fromISO(monthStart).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <View style={styles.root}>
      <View style={styles.navBar}>
        <Pressable onPress={onPrevMonth} hitSlop={8}><MaterialIcons name="chevron-left" size={26} color={colors.text} /></Pressable>
        <Text style={styles.navTitle}>{monthLabel}</Text>
        <Pressable onPress={onNextMonth} hitSlop={8}><MaterialIcons name="chevron-right" size={26} color={colors.text} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.grid}>
          {dates.map((d) => {
            const totals = sumMacros(entriesForDate(entries, d));
            const goalMet = totals.calories >= settings.dailyCalorieGoal;
            const bonusMet = totals.calories >= (settings.dailyCalorieGoal * settings.bonusGoalPercentage) / 100;
            const cellStyle = bonusMet ? styles.cellBonus : goalMet ? styles.cellGoal : styles.cellNone;
            return (
              <Pressable key={d} style={[styles.cell, cellStyle]} onPress={() => setAddingDate(d)}>
                <Text style={styles.cellDay}>{fromISO(d).getDate()}</Text>
                {totals.calories > 0 ? (
                  <Text style={styles.cellValue}>{Math.round(totals.calories)}</Text>
                ) : (
                  <MaterialIcons name="add" size={14} color={colors.textDim} />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <LogMealModal
        visible={!!addingDate}
        onClose={() => setAddingDate(null)}
        defaultDate={addingDate ?? toISO(new Date())}
        ingredients={ingredients}
        settings={settings}
        otherEntriesSameDay={(date) => entriesForDate(entries, date)}
        onSave={onSaveMeal}
      />
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
  navTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  scroll: { padding: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: {
    width: '22%', aspectRatio: 1, borderRadius: radius.sm, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  cellBonus: { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: colors.success },
  cellGoal: { backgroundColor: 'rgba(168,85,247,0.15)', borderColor: '#A855F7' },
  cellNone: { backgroundColor: 'rgba(251,140,0,0.08)', borderColor: '#FB8C00' },
  cellDay: { color: colors.text, fontSize: font.sm, fontWeight: '700' },
  cellValue: { color: colors.textMuted, fontSize: 10 },
});
