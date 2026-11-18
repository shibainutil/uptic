import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../store/habitStore';
import { todayISO, fromISO, addDays } from '../../lib/schedule';
import { computeRing, describeSchedule, isPaused, sessionSlots, withoutCurrentPause, type SessionSlot } from '../../lib/habitSchedule';
import { isHabitComplete, totalSessions, type Habit, type HabitLogEntry } from '../../types/habits';
import { habitSlotActions } from '../../lib/habitSlotActions';
import { Badge } from '../ui/Badge';
import { LogEntryModal } from './LogEntryModal';
import { colors, spacing, font, radius } from '../../theme';

const LIMITED_COLOR = '#A855F7';
const TARGET_COLOR = '#EAB308';

type SectionKey = 'overdue' | 'future' | 'ongoing' | 'paused' | 'completed' | 'archived';

function barColor(rate: number): string {
  if (rate >= 0.9) return colors.success;
  if (rate >= 0.5) return TARGET_COLOR;
  return colors.danger;
}

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

function ProgressBar({ rate, completedCount, targetSessions }: {
  rate: number; completedCount?: number; targetSessions?: number;
}) {
  const pct = Math.round(Math.min(Math.max(rate, 0), 1) * 100);
  const color = barColor(rate);
  const label = completedCount != null && targetSessions != null
    ? `${completedCount} / ${targetSessions}`
    : `${pct}%`;
  return (
    <View style={barSt.row}>
      <View style={barSt.track}>
        <View style={[barSt.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[barSt.pct, { color }]}>{label}</Text>
    </View>
  );
}

// ── Habit card ────────────────────────────────────────────────────────────────

const OVERDUE_COLOR = '#F97316';

function HabitCard({ habit, completedCount, sessionRate, section, firstSlot, onAdd, onEdit,
  onViewEntries, onPauseToggle, onArchiveToggle, onReset, onDelete, onMarkDone, onSkip, onUndoDone }: {
  habit: Habit;
  completedCount: number;
  sessionRate: number;
  section: SectionKey;
  firstSlot?: SessionSlot;
  onAdd: (d: Omit<HabitLogEntry, 'id' | 'createdAt'>) => void;
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
  const [logVisible, setLogVisible] = useState(false);
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
    : firstSlot?.status === 'done' ? colors.success
    : firstSlot?.status === 'skipped' ? colors.danger
    : colors.textMuted;

  return (
    <Pressable style={cardSt.card} onPress={onViewEntries}>
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
                color={TARGET_COLOR}
                label={`${completedCount} / ${habit.targetSessions}`}
                icon={<MaterialIcons name="gps-fixed" size={10} color={TARGET_COLOR} />}
              />
            )}
          </View>
        </View>
        <View style={cardSt.headerActions}>
          <Pressable style={[cardSt.iconBtn, cardSt.addBtn]} onPress={() => setLogVisible(true)}>
            <MaterialIcons name="add" size={16} color="#fff" />
          </Pressable>
          <Pressable style={cardSt.menuBtn} onPress={() => setMenuVisible(true)}>
            <MaterialIcons name="more-vert" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {/* Progress bar — hidden for scheduled (future-start) habits */}
      {section !== 'future' && (
        <ProgressBar
          rate={sessionRate}
          completedCount={habit.kind === 'limited' && habit.targetSessions != null ? completedCount : undefined}
          targetSessions={habit.kind === 'limited' ? habit.targetSessions : undefined}
        />
      )}

      {/* First actionable slot */}
      {firstSlot && (
        <View style={cardSt.slotRow}>
          <MaterialIcons
            name={firstSlot.status === 'done' ? 'check-circle'
              : firstSlot.status === 'skipped' ? 'cancel'
              : 'radio-button-unchecked'}
            size={18}
            color={slotTint}
          />
          <Text style={[cardSt.slotDate, { color: slotTint }]}>
            {firstSlot.status === 'overdue' ? 'Yesterday' : firstSlot.status === 'today' ? 'Today' : fromISO(firstSlot.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
            {' · '}{firstSlot.time}
          </Text>
          {firstSlot.status === 'done' || firstSlot.status === 'skipped' ? (
            <Pressable
              hitSlop={8}
              style={cardSt.slotBtn}
              onPress={() => firstSlot.status === 'done' ? onUndoDone(firstSlot) : onSkip(firstSlot, false)}
            >
              <Text style={cardSt.slotBtnText}>Undo</Text>
            </Pressable>
          ) : (
            <>
              <Pressable hitSlop={8} style={cardSt.slotBtn} onPress={() => onSkip(firstSlot, true)}>
                <Text style={cardSt.slotBtnText}>Skip</Text>
              </Pressable>
              <Pressable hitSlop={8} style={[cardSt.slotBtn, cardSt.slotBtnDone]} onPress={() => onMarkDone(firstSlot)}>
                <Text style={[cardSt.slotBtnText, { color: '#fff' }]}>Done</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      <OptionsMenu
        visible={menuVisible}
        title={habit.name}
        options={menuOptions}
        onClose={() => setMenuVisible(false)}
      />
      <LogEntryModal
        visible={logVisible}
        onSave={(loggedAt, notes, count) => {
          onAdd({ habitId: habit.id, loggedAt, notes: notes || undefined, count });
          setLogVisible(false);
        }}
        onClose={() => setLogVisible(false)}
      />
    </Pressable>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, count, open, onToggle }: {
  label: string; count: number; open: boolean; onToggle: () => void;
}) {
  return (
    <Pressable style={sectSt.header} onPress={onToggle}>
      <Text style={sectSt.label}>{label}</Text>
      <View style={sectSt.right}>
        <Text style={sectSt.count}>{count}</Text>
        <MaterialIcons
          name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={18}
          color={colors.textMuted}
        />
      </View>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function HabitsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { habits, update: updateHabit, remove: removeHabit, setPauses, setSkipped } = useHabits(user?.uid);
  const { entries, add: addEntry, update: updateEntry, remove: removeEntry, resetEntries } = useHabitLogEntries(user?.uid);
  const today = todayISO();
  const nowTime = (() => { const n = new Date(); return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; })();

  const [openSections, setOpenSections] = useState<Set<SectionKey>>(
    new Set(['overdue', 'future', 'ongoing', 'paused']),
  );

  function toggleSection(key: SectionKey) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const slotActions = habitSlotActions({
    today, entries, add: addEntry, update: updateEntry, remove: removeEntry, setSkipped,
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

    const allTimeRate = computeRing(habit, entries, 'allTime', today, nowTime).rate;
    const sessionRate = habit.kind === 'limited' && habit.targetSessions != null
      ? Math.min(completedCount / habit.targetSessions, 1)
      : allTimeRate;

    let section: SectionKey;
    if (habit.archived)               section = 'archived';
    else if (complete)                section = 'completed';
    else if (paused)                  section = 'paused';
    else if (habit.startDate > today) section = 'future';
    else                              section = 'ongoing';

    // Find the most relevant slot to show on the card:
    // overdue > yesterday-skipped > today > next upcoming > recent done/skipped (for undo).
    let firstSlot: SessionSlot | undefined;
    if (section === 'ongoing' || section === 'future') {
      const slots = sessionSlots(habit, entries, today);
      const overdue = slots.find(s => s.status === 'overdue' && s.date === addDays(today, -1));
      const yesterdaySkipped = slots.find(s => s.status === 'skipped' && s.explicit && s.date === addDays(today, -1));
      const todaySlot = slots.find(s => s.status === 'today');
      const nextUpcoming = slots.find(s => s.status === 'upcoming');
      const recentDoneSkipped = slots
        .filter(s => (s.status === 'done' || s.status === 'skipped') && s.date >= addDays(today, -1))
        .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))[0];
      firstSlot = overdue ?? yesterdaySkipped ?? todaySlot ?? recentDoneSkipped ?? nextUpcoming;
      if (overdue) section = 'overdue';
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

  const SECTIONS: { key: SectionKey; label: string }[] = [
    { key: 'overdue',   label: 'Overdue' },
    { key: 'ongoing',   label: 'Ongoing' },
    { key: 'paused',    label: 'Paused' },
    { key: 'future',    label: 'Scheduled' },
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
      <Pressable style={styles.addBtn} onPress={() => router.push('/habits/habit/new')}>
        <MaterialIcons name="add" size={15} color="#fff" />
        <Text style={styles.addBtnText}>Add habit</Text>
      </Pressable>

      {SECTIONS.map(({ key, label }) => {
        const sectionItems = items.filter(i => i.section === key);
        if (sectionItems.length === 0) return null;
        const open = openSections.has(key);
        return (
          <View key={key} style={styles.section}>
            <SectionHeader
              label={label}
              count={sectionItems.length}
              open={open}
              onToggle={() => toggleSection(key)}
            />
            {open && sectionItems.map(item => (
              <HabitCard
                key={item.habit.id}
                {...item}
                onAdd={addEntry}
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
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end',
    backgroundColor: colors.accent, paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2, borderRadius: radius.sm,
  },
  addBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '600' },
  section: { gap: 4 },
});

const sectSt = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.xs, paddingHorizontal: 2,
  },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
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
  iconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  addBtn: { backgroundColor: colors.accent },
  menuBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.surface2,
  },
  slotDate: { flex: 1, fontSize: font.sm },
  slotBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  slotBtnDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  slotBtnText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
});

const barSt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: {
    flex: 1, height: 7, backgroundColor: colors.surface2,
    borderRadius: 4, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  pct: { fontSize: font.sm, fontWeight: '700', minWidth: 36, textAlign: 'right' },
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
