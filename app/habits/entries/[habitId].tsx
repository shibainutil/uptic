import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../../src/store/habitStore';
import { LogEntryModal } from '../../../src/components/habits/LogEntryModal';
import { PauseHabitModal } from '../../../src/components/habits/PauseHabitModal';
import {
  describeSchedule, isPaused, pauseCovering, sessionSlots, withPause, withoutCurrentPause, type SessionSlot,
} from '../../../src/lib/habitSchedule';
import type { HabitPause } from '../../../src/types/habits';
import { fromISO, todayISO } from '../../../src/lib/schedule';
import { habitSlotActions } from '../../../src/lib/habitSlotActions';
import { colors, spacing, font, radius } from '../../../src/theme';

function formatSlotDate(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function errorAlert(e: unknown) {
  Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
}

export default function HabitEntriesScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { habits, setSkipped, setPauses } = useHabits(user?.uid);
  const { entries, add, update, remove } = useHabitLogEntries(user?.uid);

  const habit = habits.find((h) => h.id === habitId);

  const [modalOpen, setModalOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [futureOpen, setFutureOpen] = useState(false);
  const autoSkippedRef = useRef(false);

  const today = todayISO();
  const slots = habit ? sessionSlots(habit, entries, today) : [];

  // Auto-skip missed slots once per mount after data loads
  useEffect(() => {
    if (!habit || !slots.length || autoSkippedRef.current) return;
    const missed = slots.filter((s) => s.status === 'missed');
    if (missed.length === 0) { autoSkippedRef.current = true; return; }
    autoSkippedRef.current = true;
    Promise.all(missed.map((s) => setSkipped(habit.id, s.date, true))).catch(errorAlert);
  }, [habit?.id, slots.length]);

  const dueSlots = slots.filter((s) => s.status === 'today');
  const pastSlots = slots
    .filter((s) => s.status === 'done' || s.status === 'skipped' || s.status === 'missed')
    .sort((a, b) => b.date.localeCompare(a.date));
  const futureSlots = slots
    .filter((s) => s.status === 'upcoming')
    .sort((a, b) => a.date.localeCompare(b.date));

  const pause = habit ? pauseCovering(habit, today) : undefined;
  const nextPause = habit?.pauses?.find((p) => p.from > today);
  const day = (iso: string) => fromISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const savePause = (from: string, until?: string) => {
    setPauses(habitId!, withPause(habit?.pauses ?? [], from, until)).catch(errorAlert);
    setPauseOpen(false);
  };
  const resume = () => { if (habit) setPauses(habit.id, withoutCurrentPause(habit, today)).catch(errorAlert); };
  const cancelPause = (p: HabitPause) => {
    if (habit) setPauses(habit.id, (habit.pauses ?? []).filter((x) => x !== p)).catch(errorAlert);
  };

  const slotActions = habitSlotActions({ today, entries, add, update, remove, setSkipped, onError: errorAlert });
  const markDone = (slot: SessionSlot) => slotActions.markDone(habitId!, slot);
  const skip = (slot: SessionSlot, value: boolean) => slotActions.skip(habitId!, slot, value);
  const undoDone = (slot: SessionSlot) => slotActions.undoDone(habitId!, slot);
  function save(loggedAt: string, notes: string, count: number) {
    Promise.resolve(add({ habitId: habitId!, loggedAt, notes: notes || undefined, count })).catch(errorAlert);
    setModalOpen(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{habit?.name ?? 'Sessions'}</Text>
        <Pressable onPress={() => setModalOpen(true)} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Log</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {habit && (
          <View style={styles.scheduleRow}>
            <Text style={styles.scheduleText}>{describeSchedule(habit.schedule)}</Text>
            {!pause && (
              <Pressable onPress={() => setPauseOpen(true)} hitSlop={8} style={styles.slotBtn}>
                <Text style={styles.slotBtnText}>Pause</Text>
              </Pressable>
            )}
          </View>
        )}

        {pause && (
          <View style={styles.banner}>
            <MaterialIcons name="pause-circle-outline" size={22} color={colors.textMuted} />
            <Text style={styles.bannerText}>
              {pause.until ? `Paused until ${day(pause.until)}` : `Paused since ${day(pause.from)} until you resume`}
            </Text>
            <Pressable onPress={resume} hitSlop={8} style={[styles.slotBtn, styles.slotDone]}>
              <Text style={[styles.slotBtnText, { color: '#fff' }]}>Resume</Text>
            </Pressable>
          </View>
        )}
        {!pause && nextPause && (
          <View style={styles.banner}>
            <MaterialIcons name="pause-circle-outline" size={22} color={colors.textMuted} />
            <Text style={styles.bannerText}>
              Pause {day(nextPause.from)}{nextPause.until ? ` – ${day(nextPause.until)}` : ' until you resume'}
            </Text>
            <Pressable onPress={() => cancelPause(nextPause)} hitSlop={8} style={styles.slotBtn}>
              <Text style={styles.slotBtnText}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* Due */}
        {dueSlots.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Due</Text>
            {dueSlots.map((slot) => (
              <SlotRow key={slot.key} slot={slot} onDone={markDone} onSkip={skip} onUndo={undoDone} />
            ))}
          </>
        )}

        {/* Past */}
        {pastSlots.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Past</Text>
            {pastSlots.map((slot) => (
              <SlotRow key={slot.key} slot={slot} onDone={markDone} onSkip={skip} onUndo={undoDone} />
            ))}
          </>
        )}

        {/* Future (collapsed by default) */}
        {futureSlots.length > 0 && (
          <>
            <Pressable style={styles.sectionLabelRow} onPress={() => setFutureOpen((v) => !v)}>
              <Text style={styles.sectionLabel}>Future</Text>
              <View style={styles.sectionRight}>
                <Text style={styles.sectionCount}>{futureSlots.length}</Text>
                <MaterialIcons
                  name={futureOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={18}
                  color={colors.textMuted}
                />
              </View>
            </Pressable>
            {futureOpen && futureSlots.map((slot) => (
              <SlotRow key={slot.key} slot={slot} onDone={markDone} onSkip={skip} onUndo={undoDone} future />
            ))}
          </>
        )}

        {dueSlots.length === 0 && pastSlots.length === 0 && futureSlots.length === 0 && (
          <Text style={styles.emptyText}>Nothing scheduled yet.</Text>
        )}
      </ScrollView>

      {pauseOpen && (
        <PauseHabitModal visible today={today} onSave={savePause} onClose={() => setPauseOpen(false)} />
      )}

      <LogEntryModal
        visible={modalOpen}
        onSave={save}
        onClose={() => setModalOpen(false)}
      />
    </SafeAreaView>
  );
}

function SlotRow({ slot, onDone, onSkip, onUndo, future }: {
  slot: SessionSlot;
  onDone: (slot: SessionSlot) => void;
  onSkip: (slot: SessionSlot, value: boolean) => void;
  onUndo: (slot: SessionSlot) => void;
  future?: boolean;
}) {
  const { status } = slot;
  const tint = future
    ? colors.textDim
    : status === 'done' ? colors.success
    : status === 'missed' ? colors.danger
    : colors.textMuted;

  const dateColor = future ? colors.textDim : (status === 'done' || status === 'skipped') ? colors.textDim : colors.text;

  return (
    <View style={styles.slot}>
      <MaterialIcons
        name={status === 'done' ? 'check-circle' : status === 'skipped' ? 'redo' : 'radio-button-unchecked'}
        size={22}
        color={tint}
      />
      <View style={styles.rowMain}>
        <Text style={[styles.rowDate, { color: dateColor }]}>
          {formatSlotDate(slot.date)} · {slot.time}
        </Text>
        {status !== 'today' && status !== 'upcoming' && (
          <Text style={[styles.rowStatus, { color: tint }]}>
            {status === 'done' ? 'Done' : status === 'skipped' ? 'Skipped' : 'Missed'}
          </Text>
        )}
      </View>
      {!future && (
        status === 'skipped' ? (
          <Pressable onPress={() => onSkip(slot, false)} hitSlop={8} style={styles.slotBtn}>
            <Text style={styles.slotBtnText}>Undo skip</Text>
          </Pressable>
        ) : status === 'done' ? (
          <Pressable onPress={() => onUndo(slot)} hitSlop={8} style={styles.slotBtn}>
            <Text style={styles.slotBtnText}>Undo</Text>
          </Pressable>
        ) : (
          <>
            <Pressable onPress={() => onSkip(slot, true)} hitSlop={8} style={styles.slotBtn}>
              <Text style={styles.slotBtnText}>Skip</Text>
            </Pressable>
            <Pressable onPress={() => onDone(slot)} hitSlop={8} style={[styles.slotBtn, styles.slotDone]}>
              <Text style={[styles.slotBtnText, { color: '#fff' }]}>Done</Text>
            </Pressable>
          </>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface, gap: spacing.sm,
  },
  back: { minWidth: 48 },
  backText: { color: colors.accent, fontSize: font.md },
  headerTitle: { flex: 1, color: colors.text, fontSize: font.lg, fontWeight: '600', textAlign: 'center' },
  addBtn: {
    backgroundColor: colors.accent, paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2, borderRadius: radius.sm,
  },
  addBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '600' },
  list: { padding: spacing.lg, gap: spacing.sm },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  scheduleText: { color: colors.textMuted, fontSize: font.sm, flexShrink: 1 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  bannerText: { flex: 1, color: colors.text, fontSize: font.sm },
  sectionLabel: {
    color: colors.textMuted, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingTop: spacing.sm,
  },
  sectionLabelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionCount: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  slot: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface2,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  rowMain: { flex: 1, gap: 2 },
  rowDate: { fontSize: font.md, fontWeight: '500' },
  rowStatus: { fontSize: font.sm },
  slotBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  slotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  slotBtnText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', paddingTop: spacing.xl },
});
