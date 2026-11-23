import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../store/habitStore';
import { todayISO, fromISO, addDays } from '../../lib/schedule';
import { describeSchedule, isPaused, sessionSlots, withoutCurrentPause, type SessionSlot } from '../../lib/habitSchedule';
import { isHabitComplete, totalSessions, type Habit } from '../../types/habits';
import { habitSlotActions } from '../../lib/habitSlotActions';
import { Badge } from '../ui/Badge';
import { ProgressBar, slotsRate } from './ProgressBar';
import { ActionBtn, ActionBtnGroup } from './ActionBtn';
import { SectionHeader } from './SectionHeader';
import { slotDateLabel } from '../../lib/slotLabel';
import { useNow } from '../../hooks/useNow';
import { colors, spacing, font, radius } from '../../theme';

const LIMITED_COLOR = '#A855F7';

type SectionKey = 'overdue' | 'due' | 'upcoming' | 'done' | 'skipped' | 'pending' | 'paused' | 'completed' | 'archived';


function isHabitPaused(habit: Habit, today: string): boolean {
  return isPaused(habit, today);
}

// ── Options menu ──────────────────────────────────────────────────────────────

type MenuOption = {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color?: string;
  onPress: () => void;
};

function OptionsMenu({ visible, title, options, onClose }: {
  visible: boolean;
  title: string;
  options: MenuOption[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={menuSt.overlay} onPress={onClose}>
        <Pressable style={menuSt.sheet}>
          <Text style={menuSt.menuTitle} numberOfLines={1}>{title}</Text>
          <View style={menuSt.divider} />
          {options.map((opt, i) => (
            <Pressable
              key={i}
              style={menuSt.row}
              onPress={() => { onClose(); opt.onPress(); }}
            >
              <MaterialIcons name={opt.icon} size={18} color={opt.color ?? colors.text} />
              <Text style={[menuSt.rowLabel, opt.color ? { color: opt.color } : null]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────


// ── Habit card ────────────────────────────────────────────────────────────────

const OVERDUE_COLOR = '#F97316';
const PAUSE_COLOR = '#EAB308';
const UPCOMING_COLOR = '#A855F7';

function cardBorderColor(section: SectionKey, firstSlot?: SessionSlot): string {
  switch (section) {
    case 'overdue':  return OVERDUE_COLOR;
    case 'due':      return colors.accent;
    case 'upcoming': return UPCOMING_COLOR;
    case 'done':     return colors.success;
    case 'skipped':  return colors.danger;
    case 'pending':  return colors.border;
    case 'paused':   return PAUSE_COLOR;
    default:         return colors.surface2;
  }
}

function HabitCard({ habit, completedCount, sessionRate, section, firstSlot, onEdit,
  onViewEntries, onPauseToggle, onArchiveToggle, onReset, onDelete, onMarkDone, onSkip, onUndoDone }: {
  habit: Habit;
  completedCount: number;
  sessionRate: number;
  section: SectionKey;
  firstSlot?: SessionSlot;
  onEdit: () => void;
  onViewEntries: () => void;
  onPauseToggle: () => void;
  onArchiveToggle: () => void;
  onReset: () => void;
  onDelete: () => void;
  onMarkDone: (slot: SessionSlot) => void;
  onSkip: (slot: SessionSlot, value: boolean) => void;
  onUndoDone: (slot: SessionSlot) => void;
}) {
  const [menuVisible, setMenuVisible] = useState(false);
  const today = todayISO();
  const paused = isHabitPaused(habit, today);

  const menuOptions: MenuOption[] = [
    { label: 'Edit', icon: 'edit', onPress: onEdit },
    { label: paused ? 'Resume' : 'Pause', icon: paused ? 'play-arrow' : 'pause', onPress: onPauseToggle },
    { label: habit.archived ? 'Unarchive' : 'Archive', icon: 'archive', onPress: onArchiveToggle },
    { label: 'Reset sessions', icon: 'refresh', color: colors.danger, onPress: onReset },
    { label: 'Delete habit', icon: 'delete', color: colors.danger, onPress: onDelete },
  ];

  const slotTint = firstSlot?.status === 'overdue' ? OVERDUE_COLOR
    : firstSlot?.status === 'today' ? colors.accent
    : firstSlot?.status === 'later' ? UPCOMING_COLOR
    : firstSlot?.status === 'done' ? colors.success
    : firstSlot?.status === 'skipped' ? colors.danger
    : firstSlot?.status === 'paused' ? PAUSE_COLOR
    : colors.textMuted;

  return (
    <Pressable style={[cardSt.card, { borderColor: cardBorderColor(section, firstSlot) }]} onPress={onViewEntries}>
      {/* Header row */}
      <View style={cardSt.headerRow}>
        <View style={cardSt.headerMain}>
          <Text style={cardSt.name}>{habit.name}</Text>
          <View style={cardSt.badges}>
            <Badge
              color={colors.accent}
              label={describeSchedule(habit.schedule)}
              icon={<MaterialIcons name="event-repeat" size={10} color={colors.accent} />}
            />
            {habit.kind === 'limited' && habit.targetDate && (
              <Badge
                color={LIMITED_COLOR}
                label={`by ${fromISO(habit.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                icon={<MaterialIcons name="event" size={10} color={LIMITED_COLOR} />}
              />
            )}
            {habit.kind === 'limited' && habit.targetSessions != null && (
              <Badge
                color={LIMITED_COLOR}
                label={`${completedCount} / ${habit.targetSessions}`}
                icon={<MaterialIcons name="gps-fixed" size={10} color={LIMITED_COLOR} />}
              />
            )}
          </View>
        </View>
        <View style={cardSt.headerActions}>
          <Pressable style={cardSt.menuBtn} onPress={() => setMenuVisible(true)}>
            <MaterialIcons name="more-vert" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {/* Progress bar — hidden for habits that haven't started yet */}
      {habit.startDate <= today && (
        <ProgressBar rate={sessionRate} />
      )}

      {/* First actionable slot */}
      {firstSlot && (
        <View style={cardSt.slotRow}>
          <MaterialIcons
            name={firstSlot.status === 'done' ? 'check-circle'
              : firstSlot.status === 'skipped' ? 'cancel'
              : firstSlot.status === 'paused' ? 'pause-circle-outline'
              : firstSlot.status === 'overdue' ? 'error-outline'
              : 'radio-button-unchecked'}
            size={18}
            color={slotTint}
          />
          <Text style={[cardSt.slotDate, { color: slotTint }]}>
            {slotDateLabel(firstSlot)}
          </Text>
          {firstSlot.status === 'done' || firstSlot.status === 'skipped' ? (
            <ActionBtn
              label="Undo" icon="refresh" scheme="grey"
              onPress={() => firstSlot.status === 'done' ? onUndoDone(firstSlot) : onSkip(firstSlot, false)}
            />
          ) : firstSlot.status === 'today' || firstSlot.status === 'overdue' || firstSlot.status === 'later' ? (
            <ActionBtnGroup>
              <ActionBtn label="Skip" icon="close" scheme="red" onPress={() => onSkip(firstSlot, true)} />
              <ActionBtn label="Done" icon="check" scheme="green" onPress={() => onMarkDone(firstSlot)} />
            </ActionBtnGroup>
          ) : null}
        </View>
      )}

      <OptionsMenu
        visible={menuVisible}
        title={habit.name}
        options={menuOptions}
        onClose={() => setMenuVisible(false)}
      />
    </Pressable>
  );
}

// ── Section header ────────────────────────────────────────────────────────────


// ── Main screen ───────────────────────────────────────────────────────────────

export function HabitsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { habits, update: updateHabit, remove: removeHabit, setPauses, setSkipped } = useHabits(user?.uid);
  const { entries, add: addEntry, update: updateEntry, remove: removeEntry, resetEntries } = useHabitLogEntries(user?.uid);
  const now = useNow();
  const today = todayISO();

  const [openSections, setOpenSections] = useState<Set<SectionKey>>(
    new Set(['overdue', 'due', 'upcoming', 'done', 'skipped', 'pending', 'paused']),
  );

  function toggleSection(key: SectionKey) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const slotActions = habitSlotActions({
    today, habits, entries, setPauses, add: addEntry, update: updateEntry, remove: removeEntry, setSkipped,
    onError: (e) => Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.'),
  });

  type HabitItem = {
    habit: Habit;
    completedCount: number;
    sessionRate: number;
    section: SectionKey;
    firstSlot?: SessionSlot;
  };

  const items: HabitItem[] = habits.map(habit => {
    const habitEntries = entries.filter(e => e.habitId === habit.id);
    const completedCount = totalSessions(habitEntries);
    const complete = isHabitComplete(habit, completedCount, today);
    const paused = isHabitPaused(habit, today);

    let section: SectionKey;
    let firstSlot: SessionSlot | undefined;

    // Compute slots for all active habits — used by both section logic and rate calculation.
    const slots = (habit.archived || complete) ? [] : sessionSlots(habit, entries, today, undefined, now);

    const allTimeRate = slotsRate(slots, today);    const sessionRate = habit.kind === 'limited' && habit.targetSessions != null
      ? Math.min(completedCount / habit.targetSessions, 1)
      : allTimeRate;

    if (habit.archived) {
      section = 'archived';
    } else if (complete) {
      section = 'completed';
    } else if (paused) {
      section = 'paused';
      // Paused sessions now run ahead into the pause too: show today's (or the latest past)
      // one, else the next one coming up.
      const pausedSlots = slots.filter(s => s.status === 'paused');
      firstSlot = pausedSlots.filter(s => s.date <= today).at(-1) ?? pausedSlots[0];
    } else {
      // Most recent unhandled slot that is already due (later-today sessions wait their
      // turn below), and most recent handled slot.
      const pastAndToday = slots.filter(s => s.date <= today && s.status !== 'paused' && s.status !== 'later');
      const lastUnhandled = pastAndToday.filter(
        s => s.status !== 'done' && s.status !== 'skipped',
      ).at(-1);
      const lastHandled = pastAndToday.filter(
        s => s.status === 'done' || s.status === 'skipped',
      ).at(-1);
      // If the most recent handled slot is newer than the most recent unhandled slot,
      // the older unhandled slots are abandoned — don't drag the habit to overdue.
      const activeUnhandled = (lastHandled && lastUnhandled && lastHandled.key > lastUnhandled.key)
        ? undefined
        : lastUnhandled;
      const hasSlotToday = slots.some(s => s.date === today && s.status !== 'paused');

      if (activeUnhandled) {
        section = activeUnhandled.status === 'overdue' ? 'overdue' : 'due';
        firstSlot = activeUnhandled;
      } else if (slots.some(s => s.status === 'later')) {
        section = 'upcoming';
        firstSlot = slots.find(s => s.status === 'later');
      } else if (hasSlotToday) {
        // Show the last handled slot from today so the user can undo.
        firstSlot = slots
          .filter(s => s.date === today && (s.status === 'done' || s.status === 'skipped'))
          .sort((a, b) => b.time.localeCompare(a.time))[0];
        section = firstSlot?.status === 'skipped' ? 'skipped' : 'done';
      } else {
        section = 'pending';
        firstSlot = slots.find(s => s.status === 'upcoming');
      }
    }

    return { habit, completedCount, sessionRate, section, firstSlot };
  });

  async function handlePauseToggle(habit: Habit) {
    const paused = isHabitPaused(habit, today);
    if (paused) {
      await setPauses(habit.id, withoutCurrentPause(habit, today));
    } else {
      await setPauses(habit.id, [...(habit.pauses ?? []), { from: today }]);
    }
  }

  async function handleArchiveToggle(habit: Habit) {
    await updateHabit(habit.id, { archived: !habit.archived });
  }

  function handleReset(habit: Habit) {
    Alert.alert(
      'Reset sessions?',
      `This permanently deletes all logged sessions for "${habit.name}" and sets the start date to tomorrow.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive', onPress: async () => {
            await Promise.all([
              resetEntries(habit.id),
              updateHabit(habit.id, { startDate: addDays(today, 1), skippedDates: [] }),
            ]);
          },
        },
      ],
    );
  }

  function handleDelete(habit: Habit) {
    Alert.alert(
      `Delete "${habit.name}"?`,
      'Deletes the habit and all its logged sessions. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeHabit(habit.id) },
      ],
    );
  }

  const SECTIONS: { key: SectionKey; label: string; color?: string }[] = [
    { key: 'overdue',   label: 'Overdue',  color: OVERDUE_COLOR },
    { key: 'due',       label: 'Due',      color: colors.accent },
    { key: 'upcoming',  label: 'Upcoming', color: UPCOMING_COLOR },
    { key: 'paused',    label: 'Paused',   color: PAUSE_COLOR },
    { key: 'skipped',   label: 'Skipped',  color: colors.danger },
    { key: 'done',      label: 'Done',     color: colors.success },
    { key: 'pending',   label: 'Pending' },
    { key: 'completed', label: 'Completed' },
    { key: 'archived',  label: 'Archived' },
  ];

  if (habits.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialIcons name="track-changes" size={48} color={colors.textDim} />
        <Text style={styles.emptyText}>No habits yet.</Text>
        <Pressable style={styles.emptyAdd} onPress={() => router.push('/habits/habit/new')}>
          <Text style={styles.emptyAddText}>+ Add your first habit</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {SECTIONS.map(({ key, label, color }) => {
        const sectionItems = items
          .filter(i => i.section === key)
          .sort((a, b) => {
            const aKey = a.firstSlot ? `${a.firstSlot.date}|${a.firstSlot.time}` : '9999';
            const bKey = b.firstSlot ? `${b.firstSlot.date}|${b.firstSlot.time}` : '9999';
            return aKey.localeCompare(bKey);
          });
        if (sectionItems.length === 0) return null;
        const open = openSections.has(key);
        return (
          <View key={key} style={styles.section}>
            <SectionHeader
              label={label}
              color={color}
              count={sectionItems.length}
              open={open}
              onToggle={() => toggleSection(key)}
            />
            {open && sectionItems.map(item => (
              <HabitCard
                key={item.habit.id}
                {...item}
                onEdit={() => router.push(`/habits/habit/${item.habit.id}`)}
                onViewEntries={() => router.push(`/habits/entries/${item.habit.id}`)}
                onPauseToggle={() => handlePauseToggle(item.habit)}
                onArchiveToggle={() => handleArchiveToggle(item.habit)}
                onReset={() => handleReset(item.habit)}
                onDelete={() => handleDelete(item.habit)}
                onMarkDone={(slot) => slotActions.markDone(item.habit.id, slot)}
                onSkip={(slot, value) => slotActions.skip(item.habit.id, slot, value)}
                onUndoDone={(slot) => slotActions.undoDone(item.habit.id, slot)}
              />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textDim, fontSize: font.md },
  emptyAdd: { backgroundColor: colors.accent, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.sm },
  emptyAddText: { color: '#fff', fontWeight: '600', fontSize: font.sm },
  list: { padding: spacing.md, gap: spacing.sm },
  section: { gap: 4 },
});


const cardSt = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    marginBottom: 4,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  headerMain: { flex: 1, gap: 5 },
  name: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 },
  menuBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.surface2,
  },
  slotDate: { flex: 1, fontSize: font.sm },
});

const menuSt = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: 32,
    paddingTop: spacing.md,
  },
  menuTitle: {
    color: colors.textMuted, fontSize: font.sm, fontWeight: '600',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md, textAlign: 'center',
  },
  divider: { height: 1, backgroundColor: colors.surface2, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  rowLabel: { color: colors.text, fontSize: font.md },
});
