import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../../src/store/habitStore';
import { LogEntryModal } from '../../../src/components/habits/LogEntryModal';
import { HabitCalendar } from '../../../src/components/habits/HabitCalendar';
import { describeSchedule, sessionSlots, type SessionSlot } from '../../../src/lib/habitSchedule';
import { fromISO, toISO, todayISO } from '../../../src/lib/schedule';
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
  const { habits, setSkipped } = useHabits(user?.uid);
  const { entries, add, update, remove } = useHabitLogEntries(user?.uid);

  const habit = habits.find((h) => h.id === habitId);

  const [modalOpen, setModalOpen] = useState(false);
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });

  // The schedule, derived from the habit's rule, its log and its skipped dates.
  const today = todayISO();
  const slots = habit ? sessionSlots(habit, entries, today) : [];
  const monthStart = toISO(new Date(view.year, view.month, 1));
  const monthEnd = toISO(new Date(view.year, view.month + 1, 0));
  const monthSlots = slots.filter((x) => x.date >= monthStart && x.date <= monthEnd);

  /** Log the slot as done: on its own date and time, or right now for today's. */
  function markDone(slot: SessionSlot) {
    const [h, m] = slot.time.split(':').map(Number);
    const at = slot.date === today ? new Date() : (() => { const d = fromISO(slot.date); d.setHours(h, m, 0, 0); return d; })();
    Promise.resolve(add({ habitId: habitId!, loggedAt: at.toISOString(), count: 1 })).catch(errorAlert);
  }
  const skip = (slot: SessionSlot, value: boolean) => { setSkipped(habitId!, slot.date, value).catch(errorAlert); };

  /** Take back a Done: remove the latest session logged that day (or one off its count). */
  function undoDone(slot: SessionSlot) {
    const latest = entries
      .filter((e) => e.habitId === habitId && toISO(new Date(e.loggedAt)) === slot.date)
      .sort((x, y) => y.loggedAt.localeCompare(x.loggedAt))[0];
    if (!latest) return;
    const task = (latest.count ?? 1) > 1 ? update(latest.id, { count: (latest.count ?? 1) - 1 }) : remove(latest.id);
    Promise.resolve(task).catch(errorAlert);
  }
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
        {habit && <Text style={styles.scheduleText}>{describeSchedule(habit.schedule)}</Text>}

        <HabitCalendar
          year={view.year}
          month={view.month}
          onChange={(year, month) => setView({ year, month })}
          slots={slots}
          today={today}
        />

        {monthSlots.length === 0 ? (
          <Text style={styles.emptyText}>Nothing scheduled this month.</Text>
        ) : monthSlots.map((slot) => (
          <SlotRow key={slot.key} slot={slot} onDone={markDone} onSkip={skip} onUndo={undoDone} />
        ))}
      </ScrollView>

      <LogEntryModal
        visible={modalOpen}
        onSave={save}
        onClose={() => setModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const SLOT_LABEL: Record<SessionSlot['status'], string> = {
  done: 'Done', skipped: 'Skipped', missed: 'Missed', today: 'Today', upcoming: '',
};

/** One scheduled session: tick it off or skip it (a skip can be undone). */
function SlotRow({ slot, onDone, onSkip, onUndo }: {
  slot: SessionSlot;
  onDone: (slot: SessionSlot) => void;
  onSkip: (slot: SessionSlot, value: boolean) => void;
  onUndo: (slot: SessionSlot) => void;
}) {
  const { status } = slot;
  const tint = status === 'done' ? colors.success : status === 'missed' ? colors.danger : colors.textMuted;
  return (
    <View style={styles.slot}>
      <MaterialIcons
        name={status === 'done' ? 'check-circle' : status === 'skipped' ? 'redo' : 'radio-button-unchecked'}
        size={22}
        color={tint}
      />
      <View style={styles.rowMain}>
        <Text style={[styles.rowDate, (status === 'done' || status === 'skipped') && styles.slotDim]}>
          {formatSlotDate(slot.date)} · {slot.time}
        </Text>
        {SLOT_LABEL[status] ? <Text style={[styles.rowNotes, { color: tint }]}>{SLOT_LABEL[status]}</Text> : null}
      </View>
      {status === 'skipped' ? (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scheduleText: { color: colors.textMuted, fontSize: font.sm },
  slot: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface2,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  slotDim: { color: colors.textDim },
  slotBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  slotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  slotBtnText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  back: { minWidth: 48 },
  backText: { color: colors.accent, fontSize: font.md },
  headerTitle: { flex: 1, color: colors.text, fontSize: font.lg, fontWeight: '600', textAlign: 'center' },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  addBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textDim, fontSize: font.md },
  list: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowMain: { flex: 1, gap: 4 },
  rowDate: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  rowNotes: { color: colors.textDim, fontSize: font.sm },
});
