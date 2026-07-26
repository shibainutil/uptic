import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FastingRing } from './FastingRing';
import { MilestonesBar } from './MilestonesBar';
import { NutritionTargetBar } from './NutritionTargetBar';
import { NutrientBadgeRow } from './NutrientBadgeRow';
import {
  StartFastModal, EditStartTimeModal, EditMilestoneModal, NutritionTargetsModal, lastMealTimeFrom,
} from './FastingDialogs';
import { LogMealModal } from './LogMealModal';
import { IngredientsLibrary } from './IngredientsLibrary';
import { colors, spacing, font, radius } from '../../theme';
import { todayISO } from '../../lib/schedule';
import { computeMilestones, sessionForDate } from '../../lib/fasting';
import type { FastingSession, Ingredient, NutritionData, NutritionSettings } from '../../types/nutrition';
import { earliestSitting, entriesForDate, sumMacros, NUTRIENT_COLORS } from '../../types/nutrition';

interface Props {
  dateISO: string;
  onPrevDay: () => void;
  onNextDay: () => void;
  onGoToday: () => void;
  entries: NutritionData[];
  sessions: FastingSession[];
  activeSession: FastingSession | null;
  settings: NutritionSettings;
  ingredients: Ingredient[];
  onSaveMeal: (data: Omit<NutritionData, 'id' | 'createdAt'>) => Promise<unknown>;
  onUpdateMeal: (id: string, data: Partial<NutritionData>) => Promise<unknown>;
  onDeleteMeal: (id: string) => Promise<unknown>;
  onSaveSettings: (patch: Partial<NutritionSettings>) => Promise<unknown>;
  onStartFastingAt: (iso: string) => Promise<unknown>;
  onDiscardCycle: () => Promise<unknown>;
  onUpdateSession: (id: string, patch: Partial<FastingSession>) => Promise<unknown>;
}

export function DayView({
  dateISO, onPrevDay, onNextDay, onGoToday, entries, sessions, activeSession, settings, ingredients,
  onSaveMeal, onUpdateMeal, onDeleteMeal, onSaveSettings, onStartFastingAt, onDiscardCycle, onUpdateSession,
}: Props) {
  const isToday = dateISO === todayISO();
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!isToday) return;
    const t = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [isToday]);

  const [startFastOpen, setStartFastOpen] = useState(false);
  const [editStartOpen, setEditStartOpen] = useState(false);
  const [editMilestone, setEditMilestone] = useState<'fatBurn' | 'dailyGoal' | 'bonusGoal' | null>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<NutritionData | undefined>(undefined);

  const session = isToday ? activeSession : sessionForDate(sessions, dateISO);
  const dayEntries = entriesForDate(entries, dateISO).sort((a, b) => earliestSitting(a).localeCompare(earliestSitting(b)));
  const dayTotals = sumMacros(dayEntries);
  const milestones = session ? computeMilestones(session, settings, entries, dateISO) : null;

  function openAddMeal() { setEditingMeal(undefined); setMealModalOpen(true); }
  function openEditMeal(e: NutritionData) { setEditingMeal(e); setMealModalOpen(true); }

  async function discardCycle() {
    Alert.alert('Discard Current Cycle', 'Are you sure you want to discard the current fasting cycle? The previous cycle will continue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => onDiscardCycle() },
    ]);
  }

  const targetRows: { key: keyof typeof NUTRIENT_COLORS; min?: number; max?: number }[] = [
    { key: 'calories', min: settings.dailyCalorieMin, max: settings.dailyCalorieMax },
    { key: 'fat', min: settings.dailyFatMin, max: settings.dailyFatMax },
    { key: 'carbs', min: settings.dailyCarbsMin, max: settings.dailyCarbsMax },
    { key: 'fibre', min: settings.dailyFibreMin, max: settings.dailyFibreMax },
    { key: 'protein', min: settings.dailyProteinMin, max: settings.dailyProteinMax },
  ];
  const completeTargets = targetRows.filter((r) => r.min != null && r.max != null);
  const partialTargets = targetRows.filter((r) => (r.min != null) !== (r.max != null));

  return (
    <View style={styles.root}>
      <View style={styles.navBar}>
        <Pressable onPress={onPrevDay} hitSlop={8}>
          <MaterialIcons name="chevron-left" size={26} color={colors.text} />
        </Pressable>
        <Pressable onPress={isToday ? undefined : onGoToday} disabled={isToday} style={styles.navCenter}>
          <Text style={styles.navTitle}>
            {isToday ? 'Today' : new Date(`${dateISO}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </Text>
          {!isToday && <Text style={styles.navHint}>Tap to go to today</Text>}
        </Pressable>
        <Pressable onPress={onNextDay} disabled={isToday} hitSlop={8}>
          <MaterialIcons name="chevron-right" size={26} color={isToday ? colors.textDim : colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.ringCard}>
          <View style={styles.cardTitleRow}>
            <MaterialIcons name="access-time" size={16} color={colors.text} />
            <Text style={styles.cardTitle}>Chronometer</Text>
          </View>
          <FastingRing session={session} settings={settings} entries={entries} dateISO={dateISO} isToday={isToday} />
        </View>

        {isToday && (
          session ? (
            <View style={styles.actionRow}>
              <Pressable style={[styles.actionBtn, styles.discardBtn]} onPress={discardCycle}>
                <MaterialIcons name="delete-outline" size={18} color={colors.danger} />
                <Text style={[styles.actionBtnText, { color: colors.danger }]}>Discard current cycle</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.newCycleBtn]} onPress={() => setStartFastOpen(true)}>
                <MaterialIcons name="refresh" size={18} color="#A855F7" />
                <Text style={[styles.actionBtnText, { color: '#A855F7' }]}>Start new cycle</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.startFastBtn} onPress={() => setStartFastOpen(true)}>
              <MaterialIcons name="play-arrow" size={20} color="#fff" />
              <Text style={styles.startFastText}>Start Fast</Text>
            </Pressable>
          )
        )}

        {session && milestones && (
          <MilestonesBar
            session={session}
            settings={settings}
            milestones={milestones}
            dateISO={dateISO}
            onEditStart={() => setEditStartOpen(true)}
            onEditMilestone={setEditMilestone}
          />
        )}

        <View style={styles.metricsCard}>
          <View style={styles.cardTitleRow}>
            <MaterialIcons name="restaurant-menu" size={16} color={colors.text} />
            <Text style={styles.cardTitle}>Nutrition</Text>
            <View style={styles.spacer} />
            <Pressable onPress={() => setTargetsOpen(true)} hitSlop={8}>
              <MaterialIcons name="settings" size={18} color={colors.textMuted} />
            </Pressable>
            <Pressable onPress={() => setIngredientsOpen(true)} hitSlop={8} style={{ marginLeft: spacing.sm }}>
              <MaterialIcons name="restaurant" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {dayEntries.length > 0 && (
            <View style={styles.logsSection}>
              <Text style={styles.subLabel}>RECENT LOGS</Text>
              {dayEntries.map((e) => (
                <Pressable key={e.id} style={styles.logRow} onPress={() => openEditMeal(e)}>
                  <MaterialIcons name="schedule" size={12} color={colors.textMuted} />
                  <Text style={styles.logTime}>
                    {e.mealSittings.map((s) => new Date(s).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })).join(', ')}
                  </Text>
                  <NutrientBadgeRow values={{ calories: e.calories, fat: e.fat, carbs: e.carbs, fibre: e.fibre, protein: e.protein }} />
                </Pressable>
              ))}
            </View>
          )}

          {isToday && (
            <Pressable style={styles.logMealBtn} onPress={openAddMeal}>
              <MaterialIcons name="restaurant" size={18} color="#fff" />
              <Text style={styles.logMealBtnText}>Log Nutrition</Text>
            </Pressable>
          )}

          {completeTargets.length === 0 && partialTargets.length === 0 ? (
            <Pressable style={styles.setTargetsBtn} onPress={() => setTargetsOpen(true)}>
              <MaterialIcons name="add" size={16} color={colors.accent} />
              <Text style={styles.setTargetsText}>Set Targets</Text>
            </Pressable>
          ) : (
            <View style={styles.barsSection}>
              {partialTargets.length > 0 && (
                <View style={styles.warningBox}>
                  <View style={styles.warningHeaderRow}>
                    <MaterialIcons name="warning-amber" size={16} color="#FB8C00" />
                    <Text style={styles.warningTitle}>Incomplete Target Ranges</Text>
                  </View>
                  {partialTargets.map((r) => (
                    <Text key={r.key} style={styles.warningItem}>
                      {'•'} {r.key[0].toUpperCase() + r.key.slice(1)} range incomplete - set both min and max values
                    </Text>
                  ))}
                  <Pressable onPress={() => setTargetsOpen(true)} style={styles.warningAction}>
                    <MaterialIcons name="settings" size={14} color="#FB8C00" />
                    <Text style={styles.warningActionText}>Configure Targets</Text>
                  </Pressable>
                </View>
              )}
              {completeTargets.map((r) => (
                <NutritionTargetBar key={r.key} nutrient={r.key} current={dayTotals[r.key]} min={r.min!} max={r.max!} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <StartFastModal
        visible={startFastOpen}
        onClose={() => setStartFastOpen(false)}
        lastMealTime={lastMealTimeFrom(entries)}
        onStart={onStartFastingAt}
      />
      {session && (
        <EditStartTimeModal
          visible={editStartOpen}
          onClose={() => setEditStartOpen(false)}
          startTime={session.startTime}
          onSave={(iso) => onUpdateSession(session.id, { startTime: iso })}
        />
      )}
      <EditMilestoneModal
        visible={!!editMilestone}
        onClose={() => setEditMilestone(null)}
        milestone={editMilestone}
        settings={settings}
        onSave={onSaveSettings}
      />
      <NutritionTargetsModal
        visible={targetsOpen}
        onClose={() => setTargetsOpen(false)}
        settings={settings}
        onSave={onSaveSettings}
      />
      <IngredientsLibrary visible={ingredientsOpen} onClose={() => setIngredientsOpen(false)} />
      <LogMealModal
        visible={mealModalOpen}
        onClose={() => setMealModalOpen(false)}
        entry={editingMeal}
        defaultDate={dateISO}
        ingredients={ingredients}
        settings={settings}
        otherEntriesSameDay={(date, excludeId) => entriesForDate(entries, date).filter((e) => e.id !== excludeId)}
        onSave={(data) => (editingMeal ? onUpdateMeal(editingMeal.id, data) : onSaveMeal(data))}
        onDelete={onDeleteMeal}
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
  navCenter: { alignItems: 'center' },
  navTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  navHint: { color: colors.accent, fontSize: font.sm },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 },
  ringCard: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.surface2,
    padding: spacing.md, gap: spacing.sm, alignItems: 'center',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'stretch' },
  cardTitle: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  spacer: { flex: 1 },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingVertical: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1,
  },
  discardBtn: { backgroundColor: colors.dangerDim, borderColor: colors.danger },
  newCycleBtn: { backgroundColor: 'rgba(168,85,247,0.15)', borderColor: '#A855F7' },
  actionBtnText: { fontSize: font.sm, fontWeight: '700' },
  startFastBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: '#FB8C00', paddingVertical: spacing.md, borderRadius: radius.md,
  },
  startFastText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  metricsCard: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.surface2,
    padding: spacing.md, gap: spacing.md,
  },
  logsSection: { gap: spacing.xs },
  subLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm,
  },
  logTime: { color: colors.text, fontSize: 11, fontWeight: '700', width: 90 },
  logMealBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.accent, paddingVertical: spacing.sm + 2, borderRadius: radius.md,
  },
  logMealBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '700' },
  setTargetsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  setTargetsText: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
  barsSection: { gap: spacing.md },
  warningBox: {
    backgroundColor: 'rgba(251,140,0,0.1)', borderWidth: 1, borderColor: '#FB8C00',
    borderRadius: radius.sm, padding: spacing.sm, gap: 4,
  },
  warningHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  warningTitle: { color: '#FB8C00', fontSize: font.sm, fontWeight: '700' },
  warningItem: { color: '#FB8C00', fontSize: 11 },
  warningAction: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  warningActionText: { color: '#FB8C00', fontSize: 11, fontWeight: '600' },
});
