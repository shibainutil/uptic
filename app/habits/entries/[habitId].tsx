import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../../src/store/habitStore';
import { LogEntryModal } from '../../../src/components/habits/LogEntryModal';
import { HabitCalendar } from '../../../src/components/habits/HabitCalendar';
import { PauseHabitModal } from '../../../src/components/habits/PauseHabitModal';
import {
  describeSchedule, isPaused, pauseCovering, sessionSlots, withPause, withoutCurrentPause, type SessionSlot,
} from '../../../src/lib/habitSchedule';
import { totalSessions, type HabitPause } from '../../../src/types/habits';
import { ProgressBar, slotsRate } from '../../../src/components/habits/ProgressBar';
import { fromISO, todayISO } from '../../../src/lib/schedule';
import { habitSlotActions } from '../../../src/lib/habitSlotActions';
import { colors, spacing, font, radius } from '../../../src/theme';

import { LabeledBox } from '../../../src/components/ui/LabeledBox';
import { ActionBtn, ActionBtnGroup, PAUSE_COLOR, PAUSE_BG, PAUSE_BORDER } from '../../../src/components/habits/ActionBtn';

const OVERDUE_COLOR = '#F97316';

type MIName = React.ComponentProps<typeof MaterialIcons>['name'];

function pauseInMonth(p: HabitPause, year: number, month: number): boolean {
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthStart = `${year}-${pad(month + 1)}-01`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;
  return p.from <= monthEnd && (p.until == null || p.until >= monthStart);
}

function formatSlotDate(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
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
  const [editingPause, setEditingPause] = useState<HabitPause | undefined>();
  const [futureOpen, setFutureOpen] = useState(false);
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const today = todayISO();
  const slots = habit ? sessionSlots(habit, entries, today) : [];

  const rate = habit?.kind === 'limited' && habit.targetSessions != null
    ? Math.min(totalSessions(entries.filter((e) => e.habitId === habit.id)) / habit.targetSessions, 1)
    : slotsRate(slots, today);

  const overdueSlots = slots.filter((s) => s.status === 'overdue');
  const dueSlots = slots.filter((s) => s.status === 'today');
  const pastSlots = slots
    .filter((s) => s.status === 'done' || s.status === 'skipped' || s.status === 'paused')
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const futureSlots = slots
    .filter((s) => s.status === 'upcoming')
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const pause = habit ? pauseCovering(habit, today) : undefined;
  const futurePauses = (habit?.pauses ?? []).filter((p) => p.from > today);
  const pastPauses = (habit?.pauses ?? []).filter((p) => p !== pause && p.until != null && p.until < today);
  const day = (iso: string) => fromISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  const savePause = (from: string, until?: string) => {
    setPauses(habitId!, withPause(habit?.pauses ?? [], from, until)).catch(errorAlert);
    setPauseOpen(false);
  };

  const saveEditedPause = (from: string, until?: string) => {
    if (!habit || !editingPause) return;
    const remaining = (habit.pauses ?? []).filter((p) => p !== editingPause);
    setPauses(habit.id, withPause(remaining, from, until)).catch(errorAlert);
    setEditingPause(undefined);
  };

  const resume = () => { if (habit) setPauses(habit.id, withoutCurrentPause(habit, today)).catch(errorAlert); };
  const cancelPause = (p: HabitPause) => {
    if (habit) setPauses(habit.id, (habit.pauses ?? []).filter((x) => x !== p)).catch(errorAlert);
  };
  const slotActions = habitSlotActions({ today, habits, entries, setPauses, add, update, remove, setSkipped, onError: errorAlert });
  const undoPause = (slot: SessionSlot) => slotActions.undoPause(habitId!, slot);
  const markDone = (slot: SessionSlot) => slotActions.markDone(habitId!, slot);
  const skip = (slot: SessionSlot, value: boolean) => slotActions.skip(habitId!, slot, value);
  const undoDone = (slot: SessionSlot) => slotActions.undoDone(habitId!, slot);

  function saveEntry(loggedAt: string, notes: string, count: number) {
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
          <LabeledBox label="Frequency" labelColor={colors.accent} style={styles.freqBanner}>
            <MaterialIcons name="event-repeat" size={20} color={colors.accent} />
            <Text style={styles.freqText}>{describeSchedule(habit.schedule)}</Text>
            <ActionBtnGroup>
              <ActionBtn label="Edit" icon="edit" scheme="grey" onPress={() => router.push(`/habits/habit/${habit.id}`)} />
              <ActionBtn label="Pause" icon="pause" scheme="yellow" onPress={() => setPauseOpen(true)} />
            </ActionBtnGroup>
          </LabeledBox>
        )}

        {/* Active pause banner (yellow) — only shown for the viewed month */}
        {pause && pauseInMonth(pause, view.year, view.month) && (
          <LabeledBox label="Pause" labelColor={PAUSE_COLOR} style={styles.pauseBanner}>
            <MaterialIcons name="pause-circle-outline" size={20} color={PAUSE_COLOR} />
            <Text style={styles.pauseBannerText}>
              {pause.until
                ? `${day(pause.from)} – ${day(pause.until)}`
                : `Since ${day(pause.from)}`}
            </Text>
            <ActionBtnGroup>
              <ActionBtn label="Edit" icon="edit" scheme="grey" onPress={() => setEditingPause(pause)} />
              <ActionBtn label="Resume" icon="play-arrow" scheme="blue" onPress={resume} />
            </ActionBtnGroup>
          </LabeledBox>
        )}

        {/* Scheduled future pause banner (yellow) — only shown for the viewed month */}
        {futurePauses.filter((p) => pauseInMonth(p, view.year, view.month)).map((p) => (
          <LabeledBox key={p.from} label="Pause" labelColor={PAUSE_COLOR} style={styles.pauseBanner}>
            <MaterialIcons name="pause-circle-outline" size={20} color={PAUSE_COLOR} />
            <Text style={styles.pauseBannerText}>
              {p.until ? `${day(p.from)} – ${day(p.until)}` : `From ${day(p.from)}`}
            </Text>
            <ActionBtnGroup>
              <ActionBtn label="Edit" icon="edit" scheme="grey" onPress={() => setEditingPause(p)} />
              <ActionBtn label="Cancel" icon="close" scheme="red" onPress={() => cancelPause(p)} />
            </ActionBtnGroup>
          </LabeledBox>
        ))}

        {/* Past pauses (ended) — only for the viewed month */}
        {pastPauses.filter((p) => pauseInMonth(p, view.year, view.month)).map((p, i) => (
          <LabeledBox key={i} label="Past pause" style={[styles.pauseBanner, styles.pauseBannerPast]}>
            <MaterialIcons name="history" size={20} color={colors.textMuted} />
            <Text style={[styles.pauseBannerText, { color: colors.textDim }]}>
              {`${day(p.from)} – ${day(p.until!)}`}
            </Text>
            <ActionBtnGroup>
              <ActionBtn label="Edit" icon="edit" scheme="grey" onPress={() => setEditingPause(p)} />
              <ActionBtn label="Remove" icon="delete" scheme="red" onPress={() => cancelPause(p)} />
            </ActionBtnGroup>
          </LabeledBox>
        ))}

        <HabitCalendar
          year={view.year}
          month={view.month}
          onChange={(year, month) => setView({ year, month })}
          slots={slots}
          today={today}
          pausedOn={(iso) => !!habit && isPaused(habit, iso)}
        />

        {habit && (
          <LabeledBox label="Progress" style={styles.progressCard}>
            <View style={{ flex: 1 }}><ProgressBar rate={rate} /></View>
          </LabeledBox>
        )}

        {overdueSlots.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Overdue</Text>
            {overdueSlots.map((slot) => (
              <SlotRow key={slot.key} slot={slot} onDone={markDone} onSkip={skip} onUndo={undoDone} onUndoPause={undoPause} />
            ))}
          </>
        )}

        {dueSlots.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Due</Text>
            {dueSlots.map((slot) => (
              <SlotRow key={slot.key} slot={slot} onDone={markDone} onSkip={skip} onUndo={undoDone} onUndoPause={undoPause} />
            ))}
          </>
        )}

        {/* Complete */}
        {pastSlots.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Complete</Text>
            {pastSlots.map((slot) => (
              <SlotRow key={slot.key} slot={slot} onDone={markDone} onSkip={skip} onUndo={undoDone} onUndoPause={undoPause} />
            ))}
          </>
        )}

        {/* Incomplete (collapsed by default) */}
        {futureSlots.length > 0 && (
          <>
            <Pressable style={styles.sectionLabelRow} onPress={() => setFutureOpen((v) => !v)}>
              <Text style={styles.sectionLabel}>Incomplete</Text>
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
              <SlotRow key={slot.key} slot={slot} onDone={markDone} onSkip={skip} onUndo={undoDone} onUndoPause={undoPause} future />
            ))}
          </>
        )}

        {overdueSlots.length === 0 && dueSlots.length === 0 && pastSlots.length === 0 && futureSlots.length === 0 && (
          <Text style={styles.emptyText}>Nothing scheduled yet.</Text>
        )}
      </ScrollView>

      {pauseOpen && (
        <PauseHabitModal visible today={today} onSave={savePause} onClose={() => setPauseOpen(false)} />
      )}

      {editingPause && (
        <PauseHabitModal
          visible
          today={today}
          initialFrom={editingPause.from}
          initialUntil={editingPause.until}
          onSave={saveEditedPause}
          onDelete={() => { cancelPause(editingPause); setEditingPause(undefined); }}
          onClose={() => setEditingPause(undefined)}
        />
      )}

      <LogEntryModal
        visible={modalOpen}
        onSave={saveEntry}
        onClose={() => setModalOpen(false)}
      />
    </SafeAreaView>
  );
}

function slotTint(status: SessionSlot['status'], future?: boolean): string {
  if (future) return colors.textDim;
  switch (status) {
    case 'done':    return colors.success;
    case 'skipped': return colors.danger;
    case 'overdue': return OVERDUE_COLOR;
    case 'paused':  return PAUSE_COLOR;
    case 'today':   return colors.accent;
    default:        return colors.textMuted;
  }
}

function slotIcon(status: SessionSlot['status']): MIName {
  switch (status) {
    case 'done':    return 'check-circle';
    case 'skipped': return 'cancel';
    case 'overdue': return 'error-outline';
    case 'paused':  return 'pause-circle-outline';
    default:        return 'radio-button-unchecked';
  }
}

const SLOT_STATUS_LABEL: Partial<Record<SessionSlot['status'], string>> = {
  done:    'Done',
  skipped: 'Skipped',
  overdue: 'Overdue',
  paused:  'Paused',
};

function slotIconName(status: SessionSlot['status'], extra?: boolean): MIName {
  if (extra) return status === 'done' ? 'check-box' : 'check-box-outline-blank';
  return slotIcon(status);
}

function SlotRow({ slot, onDone, onSkip, onUndo, onUndoPause, future }: {
  slot: SessionSlot;
  onDone: (slot: SessionSlot) => void;
  onSkip: (slot: SessionSlot, value: boolean) => void;
  onUndo: (slot: SessionSlot) => void;
  onUndoPause: (slot: SessionSlot) => void;
  future?: boolean;
}) {
  const { status } = slot;
  const tint = slotTint(status, future);
  const dateColor = future || status === 'done' || status === 'skipped' || status === 'paused'
    ? colors.textDim : colors.text;
  const label = SLOT_STATUS_LABEL[status];
  const readOnly = future && status !== 'upcoming';

  return (
    <View style={styles.slot}>
      <MaterialIcons name={slotIconName(status, slot.extra)} size={22} color={tint} />
      <View style={styles.rowMain}>
        <Text style={[styles.rowDate, { color: dateColor }]}>
          {formatSlotDate(slot.date)} · {slot.time}
        </Text>
        {label ? <Text style={[styles.rowStatus, { color: tint }]}>{label}</Text> : null}
      </View>
      {!readOnly && (
        status === 'skipped' ? (
          <ActionBtn label="Undo" icon="refresh" scheme="grey" onPress={() => onSkip(slot, false)} />
        ) : status === 'done' ? (
          <ActionBtn label="Undo" icon="refresh" scheme="grey" onPress={() => onUndo(slot)} />
        ) : status === 'paused' ? (
          <ActionBtn label="Undo" icon="refresh" scheme="grey" onPress={() => onUndoPause(slot)} />
        ) : (
          <ActionBtnGroup>
            <ActionBtn label="Skip" icon="close" scheme="red" onPress={() => onSkip(slot, true)} />
            <ActionBtn label="Done" icon="check" scheme="green" onPress={() => onDone(slot)} />
          </ActionBtnGroup>
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
  freqBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(59,130,246,0.10)', borderRadius: radius.sm,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.30)',
    paddingHorizontal: spacing.lg, minHeight: 48,
  },
  freqText: { flex: 1, color: colors.text, fontSize: font.sm },
  progressCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, minHeight: 48,
  },
  pauseBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: PAUSE_BG, borderRadius: radius.sm, borderWidth: 1, borderColor: PAUSE_BORDER,
    paddingHorizontal: spacing.lg, minHeight: 48,
  },
  pauseBannerPast: { backgroundColor: colors.surface2, borderColor: colors.border },
  pauseBannerText: { flex: 1, color: colors.text, fontSize: font.sm },
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
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', paddingTop: spacing.xl },
});
