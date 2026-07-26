import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { DayView } from './DayView';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';
import { Segmented } from '../ui/Segmented';
import { colors, spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useIngredients, useNutritionEntries, useNutritionSettings, useFastingSessions } from '../../store/nutritionStore';
import { todayISO, addDays, toISO, fromISO } from '../../lib/schedule';

type ViewMode = 'day' | 'week' | 'month';

function weekStartOf(dateISO: string): string {
  const d = fromISO(dateISO);
  const mondayOffset = (d.getDay() + 6) % 7; // 0 = Monday
  return addDays(dateISO, -mondayOffset);
}

function monthStartOf(dateISO: string): string {
  const d = fromISO(dateISO);
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function NutritionTracker() {
  const { user } = useAuth();
  const { ingredients } = useIngredients(user?.uid);
  const { entries, add: addMeal, update: updateMeal, remove: removeMeal } = useNutritionEntries(user?.uid);
  const { settings, save: saveSettings } = useNutritionSettings(user?.uid);
  const {
    sessions, activeSession, startFastingAt, discardCurrentCycle, updateSession,
  } = useFastingSessions(user?.uid);

  const [mode, setMode] = useState<ViewMode>('day');
  const [dayISO, setDayISO] = useState(todayISO());
  const [weekStart, setWeekStart] = useState(weekStartOf(todayISO()));
  const [monthStart, setMonthStart] = useState(monthStartOf(todayISO()));

  function selectDay(iso: string) {
    setDayISO(iso);
    setWeekStart(weekStartOf(iso));
    setMonthStart(monthStartOf(iso));
    setMode('day');
  }

  return (
    <View style={styles.root}>
      <View style={styles.toggleBar}>
        <Segmented
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </View>

      {mode === 'day' && (
        <DayView
          dateISO={dayISO}
          onPrevDay={() => selectDay(addDays(dayISO, -1))}
          onNextDay={() => { if (dayISO !== todayISO()) selectDay(addDays(dayISO, 1)); }}
          onGoToday={() => selectDay(todayISO())}
          entries={entries}
          sessions={sessions}
          activeSession={activeSession}
          settings={settings}
          ingredients={ingredients}
          onSaveMeal={addMeal}
          onUpdateMeal={updateMeal}
          onDeleteMeal={removeMeal}
          onSaveSettings={saveSettings}
          onStartFastingAt={startFastingAt}
          onDiscardCycle={discardCurrentCycle}
          onUpdateSession={updateSession}
        />
      )}

      {mode === 'week' && (
        <WeekView
          weekStart={weekStart}
          onPrevWeek={() => setWeekStart(addDays(weekStart, -7))}
          onNextWeek={() => setWeekStart(addDays(weekStart, 7))}
          entries={entries}
          sessions={sessions}
          settings={settings}
          onSaveSettings={saveSettings}
          onSelectDay={selectDay}
        />
      )}

      {mode === 'month' && (
        <MonthView
          monthStart={monthStart}
          onPrevMonth={() => setMonthStart(toISO(new Date(fromISO(monthStart).getFullYear(), fromISO(monthStart).getMonth() - 1, 1)))}
          onNextMonth={() => setMonthStart(toISO(new Date(fromISO(monthStart).getFullYear(), fromISO(monthStart).getMonth() + 1, 1)))}
          entries={entries}
          settings={settings}
          ingredients={ingredients}
          onSaveMeal={addMeal}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  toggleBar: { padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
});
