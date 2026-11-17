import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../store/habitStore';
import { todayISO, fromISO, diffDays } from '../../lib/schedule';
import { computeRing, describeSchedule } from '../../lib/habitSchedule';
import { isHabitComplete, totalSessions, type Habit, type HabitLogEntry } from '../../types/habits';
import { Badge } from '../ui/Badge';
import { LogEntryModal } from './LogEntryModal';
import { colors, spacing, font, radius } from '../../theme';

const LIMITED_COLOR = '#A855F7';
const TARGET_COLOR = '#EAB308';
const PREVIEW_COUNT = 5;

type SectionKey = 'ongoing' | 'paused' | 'completed' | 'archived';

function barColor(rate: number): string {
  if (rate >= 0.9) return colors.success;
  if (rate >= 0.5) return TARGET_COLOR;
  return colors.danger;
}

function isHabitPaused(habit: Habit, today: string): boolean {
  if (!habit.pauses?.length) return false;
  const last = habit.pauses[habit.pauses.length - 1];
  return !last.until || last.until >= today;
}

function formatEntry(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
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

function ProgressBar({ rate }: { rate: number }) {
  const pct = Math.round(Math.min(Math.max(rate, 0), 1) * 100);
  const color = barColor(rate);
  return (
    <View style={barSt.row}>
      <View style={barSt.track}>
        <View style={[barSt.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[barSt.pct, { color }]}>{pct}%</Text>
    </View>
  );
}

// ── Habit card ────────────────────────────────────────────────────────────────

function HabitCard({ habit, completedCount, sessionRate, habitEntries, onAdd, onEdit,
  onViewEntries, onPauseToggle, onArchiveToggle, onReset, onDelete }: {
  habit: Habit;
  completedCount: number;
  sessionRate: number;
  habitEntries: HabitLogEntry[];
  onAdd: (d: Omit<HabitLogEntry, 'id' | 'createdAt'>) => void;
  onEdit: () => void;
  onViewEntries: () => void;
  onPauseToggle: () => void;
  onArchiveToggle: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [logVisible, setLogVisible] = useState(false);
  const today = todayISO();
  const paused = isHabitPaused(habit, today);

  const sortedEntries = habitEntries
    .slice()
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const preview = sortedEntries.slice(0, PREVIEW_COUNT);

  const menuOptions: MenuOption[] = [
    { label: 'Edit', icon: 'edit', onPress: onEdit },
    { label: paused ? 'Resume' : 'Pause', icon: paused ? 'play-arrow' : 'pause', onPress: onPauseToggle },
    { label: habit.archived ? 'Unarchive' : 'Archive', icon: 'archive', onPress: onArchiveToggle },
    { label: 'Reset sessions', icon: 'refresh', color: colors.danger, onPress: onReset },
    { label: 'Delete habit', icon: 'delete', color: colors.danger, onPress: onDelete },
  ];

  return (
    <Pressable style={cardSt.card} onPress={() => setExpanded(v => !v)}>
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

      {/* Progress bar */}
      <ProgressBar rate={sessionRate} />

      {/* Expanded: recent sessions */}
      {expanded && (
        <View style={cardSt.expanded}>
          <Text style={cardSt.expandedTitle}>Recent sessions</Text>
          {preview.length === 0 ? (
            <Text style={cardSt.noSessions}>No sessions logged yet.</Text>
          ) : (
            preview.map(e => (
              <View key={e.id} style={cardSt.sessionRow}>
                <MaterialIcons name="check-circle" size={13} color={colors.success} />
                <Text style={cardSt.sessionText}>
                  {formatEntry(e.loggedAt)}
                  {e.count && e.count > 1 ? ` · ×${e.count}` : ''}
                </Text>
              </View>
            ))
          )}
          {sortedEntries.length > PREVIEW_COUNT && (
            <Pressable style={cardSt.viewAllRow} onPress={onViewEntries}>
              <Text style={cardSt.viewAllText}>View all {sortedEntries.length} sessions</Text>
              <MaterialIcons name="chevron-right" size={15} color={colors.accent} />
            </Pressable>
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
  const { habits, update: updateHabit, remove: removeHabit, setPauses } = useHabits(user?.uid);
  const { entries, add: addEntry, resetEntries } = useHabitLogEntries(user?.uid);
  const today = todayISO();

  const [openSections, setOpenSections] = useState<Set<SectionKey>>(
    new Set(['ongoing', 'paused']),
  );

  function toggleSection(key: SectionKey) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  type HabitItem = {
    habit: Habit;
    completedCount: number;
    habitEntries: HabitLogEntry[];
    sessionRate: number;
    section: SectionKey;
  };

  const items: HabitItem[] = habits.map(habit => {
    const habitEntries = entries.filter(e => e.habitId === habit.id);
    const completedCount = totalSessions(habitEntries);
    const complete = isHabitComplete(habit, completedCount, today);
    const paused = isHabitPaused(habit, today);

    const allTimeRate = computeRing(habit, entries, 'allTime', today).rate;
    const sessionRate = habit.kind === 'limited' && habit.targetSessions != null
      ? Math.min(completedCount / habit.targetSessions, 1)
      : allTimeRate;

    let section: SectionKey;
    if (habit.archived)   section = 'archived';
    else if (complete)    section = 'completed';
    else if (paused)      section = 'paused';
    else                  section = 'ongoing';

    return { habit, completedCount, habitEntries, sessionRate, section };
  });

  async function handlePauseToggle(habit: Habit) {
    const paused = isHabitPaused(habit, today);
    const existing = habit.pauses ?? [];
    if (paused) {
      const last = existing[existing.length - 1];
      await setPauses(habit.id, [...existing.slice(0, -1), { ...last, until: today }]);
    } else {
      await setPauses(habit.id, [...existing, { from: today }]);
    }
  }

  async function handleArchiveToggle(habit: Habit) {
    await updateHabit(habit.id, { archived: !habit.archived });
  }

  function handleReset(habit: Habit) {
    Alert.alert(
      'Reset sessions?',
      `This permanently deletes all logged sessions for "${habit.name}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => resetEntries(habit.id) },
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
    { key: 'ongoing',   label: 'Ongoing' },
    { key: 'paused',    label: 'Paused' },
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
  expanded: { borderTopWidth: 1, borderTopColor: colors.surface2, paddingTop: spacing.sm, gap: 6 },
  expandedTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  noSessions: { color: colors.textDim, fontSize: font.sm },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 2 },
  sessionText: { color: colors.text, fontSize: font.sm, flex: 1 },
  viewAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, paddingTop: 2 },
  viewAllText: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
});

const barSt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: {
    flex: 1, height: 7, backgroundColor: colors.surface2,
    borderRadius: 4, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  pct: { fontSize: font.sm, fontWeight: '700', width: 36, textAlign: 'right' },
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
