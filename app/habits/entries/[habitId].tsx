import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../../src/store/habitStore';
import { LogEntryModal } from '../../../src/components/habits/LogEntryModal';
import { describeSchedule, sessionSlots, type SessionSlot } from '../../../src/lib/habitSchedule';
import { fromISO, todayISO } from '../../../src/lib/schedule';
import { colors, spacing, font, radius } from '../../../src/theme';
import type { HabitLogEntry } from '../../../src/types/habits';

function formatSlotDate(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function errorAlert(e: unknown) {
  Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function HabitEntriesScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { habits, setSkipped } = useHabits(user?.uid);
  const { entries, add, update, remove } = useHabitLogEntries(user?.uid);

  const habit = habits.find((h) => h.id === habitId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HabitLogEntry | undefined>(undefined);

  const habitEntries = entries
    .filter((e) => e.habitId === habitId)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));

  // The schedule, derived from the habit's rule, its log and its skipped dates.
  const today = todayISO();
  const slots = habit ? sessionSlots(habit, entries, today) : [];
  const upcoming = slots.filter((x) => x.date >= today);
  const earlier = slots.filter((x) => x.date < today).reverse();

  /** Log the slot as done: on its own date and time, or right now for today's. */
  function markDone(slot: SessionSlot) {
    const [h, m] = slot.time.split(':').map(Number);
    const at = slot.date === today ? new Date() : (() => { const d = fromISO(slot.date); d.setHours(h, m, 0, 0); return d; })();
    Promise.resolve(add({ habitId: habitId!, loggedAt: at.toISOString(), count: 1 })).catch(errorAlert);
  }
  const skip = (slot: SessionSlot, value: boolean) => { setSkipped(habitId!, slot.date, value).catch(errorAlert); };

  function openNew() {
    setEditing(undefined);
    setModalOpen(true);
  }
  function openEdit(entry: HabitLogEntry) {
    setEditing(entry);
    setModalOpen(true);
  }
  function save(loggedAt: string, notes: string, count: number) {
    if (editing) {
      update(editing.id, { loggedAt, notes: notes || undefined, count });
    } else {
      add({ habitId: habitId!, loggedAt, notes: notes || undefined, count });
    }
    setModalOpen(false);
  }
  function confirmDelete() {
    if (!editing) return;
    Alert.alert('Delete Session', 'Remove this logged session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { remove(editing.id); setModalOpen(false); } },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{habit?.name ?? 'Sessions'}</Text>
        <Pressable onPress={openNew} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Log</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {habit && <Text style={styles.scheduleText}>{describeSchedule(habit.schedule)}</Text>}

        <Text style={styles.sectionHeader}>Upcoming</Text>
        {upcoming.length === 0 ? (
          <Text style={styles.emptyText}>Nothing scheduled.</Text>
        ) : upcoming.map((slot) => <SlotRow key={slot.key} slot={slot} onDone={markDone} onSkip={skip} />)}

        {earlier.length > 0 && <Text style={styles.sectionHeader}>Earlier</Text>}
        {earlier.map((slot) => <SlotRow key={slot.key} slot={slot} onDone={markDone} onSkip={skip} />)}

        <Text style={styles.sectionHeader}>Logged sessions</Text>
        {habitEntries.length === 0 ? (
          <Text style={styles.emptyText}>No sessions logged yet.</Text>
        ) : habitEntries.map((item) => (
          <Pressable key={item.id} style={styles.row} onPress={() => openEdit(item)}>
            <View style={styles.rowMain}>
              <Text style={styles.rowDate}>
                {formatDateTime(item.loggedAt)}{item.count && item.count > 1 ? ` · ×${item.count}` : ''}
              </Text>
              {item.notes ? <Text style={styles.rowNotes} numberOfLines={2}>{item.notes}</Text> : null}
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>

      <LogEntryModal
        visible={modalOpen}
        entry={editing}
        onSave={save}
        onDelete={editing ? confirmDelete : undefined}
        onClose={() => setModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const SLOT_LABEL: Record<SessionSlot['status'], string> = {
  done: 'Done', skipped: 'Skipped', missed: 'Missed', today: 'Today', upcoming: '',
};

/** One scheduled session: tick it off or skip it (a skip can be undone). */
function SlotRow({ slot, onDone, onSkip }: {
  slot: SessionSlot;
  onDone: (slot: SessionSlot) => void;
  onSkip: (slot: SessionSlot, value: boolean) => void;
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
      ) : status !== 'done' ? (
        <>
          <Pressable onPress={() => onSkip(slot, true)} hitSlop={8} style={styles.slotBtn}>
            <Text style={styles.slotBtnText}>Skip</Text>
          </Pressable>
          <Pressable onPress={() => onDone(slot)} hitSlop={8} style={[styles.slotBtn, styles.slotDone]}>
            <Text style={[styles.slotBtnText, { color: '#fff' }]}>Done</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scheduleText: { color: colors.textMuted, fontSize: font.sm },
  sectionHeader: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.sm,
  },
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
