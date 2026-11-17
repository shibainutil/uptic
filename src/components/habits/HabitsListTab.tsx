import { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useHabits, useHabitLogEntries } from '../../store/habitStore';
import { describeSchedule, pauseCovering, withPause, withoutCurrentPause } from '../../lib/habitSchedule';
import { fromISO, todayISO } from '../../lib/schedule';
import { isHabitComplete, totalSessions, type Habit } from '../../types/habits';
import { Badge } from '../ui/Badge';
import { ActionSheet, type ActionSheetItem } from '../ui/ActionSheet';
import { PauseHabitModal } from './PauseHabitModal';
import { colors, spacing, font, radius } from '../../theme';

const LIMITED_COLOR = '#A855F7'; // kept independent of colors.accent, matches gym's reschedule-purple convention

export function HabitsListTab() {
  const { user } = useAuth();
  const { habits, remove, setPauses } = useHabits(user?.uid);
  const [menuHabit, setMenuHabit] = useState<Habit | null>(null);
  const [pauseHabit, setPauseHabit] = useState<Habit | null>(null);
  const { entries } = useHabitLogEntries(user?.uid);
  const router = useRouter();
  const today = todayISO();

  function confirmDelete(id: string, name: string) {
    Alert.alert('Delete Habit', `Remove "${name}"? Its logged sessions will also be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(id) },
    ]);
  }

  const errorAlert = (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');

  // Per-habit menu: edit, open its sessions calendar, pause / resume, delete.
  const menuItems: ActionSheetItem[] = [];
  if (menuHabit) {
    const h = menuHabit;
    menuItems.push({ label: 'Edit', icon: 'edit', onPress: () => router.push(`/habits/habit/${h.id}`) });
    menuItems.push({ label: 'Sessions & calendar', icon: 'event', onPress: () => router.push(`/habits/entries/${h.id}`) });
    if (pauseCovering(h, today)) {
      menuItems.push({
        label: 'Resume',
        icon: 'play-circle-outline',
        onPress: () => { setPauses(h.id, withoutCurrentPause(h, today)).catch(errorAlert); },
      });
    } else {
      menuItems.push({ label: 'Pause…', icon: 'pause-circle-outline', onPress: () => setPauseHabit(h) });
    }
    menuItems.push({ label: 'Delete', icon: 'delete-outline', destructive: true, onPress: () => confirmDelete(h.id, h.name) });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.count}>{habits.length} habit{habits.length !== 1 ? 's' : ''}</Text>
        <Pressable onPress={() => router.push('/habits/habit/new')} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {habits.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="track-changes" size={48} color={colors.textDim} />
          <Text style={styles.emptyText}>No habits yet.{'\n'}Create one with a schedule.</Text>
        </View>
      ) : (
        <FlatList
          data={habits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            const completedCount = totalSessions(entries.filter((e) => e.habitId === item.id));
            const done = isHabitComplete(item, completedCount, today);
            return (
              <Pressable style={styles.card} onPress={() => router.push(`/habits/habit/${item.id}`)}>
                <View style={styles.cardMain}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
                  <View style={styles.cardMetaRow}>
                    <Badge
                      color={colors.accent}
                      label={describeSchedule(item.schedule)}
                      icon={<MaterialIcons name="event-repeat" size={11} color={colors.accent} />}
                    />
                    {pauseCovering(item, today) && (
                      <Badge color={colors.textMuted} label="Paused" icon={<MaterialIcons name="pause" size={11} color={colors.textMuted} />} />
                    )}
                    {item.kind === 'limited' && item.targetDate && (
                      <Badge
                        color={LIMITED_COLOR}
                        label={`by ${fromISO(item.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                        icon={<MaterialIcons name="flag" size={11} color={LIMITED_COLOR} />}
                      />
                    )}
                    {item.kind === 'limited' && (
                      <Text style={styles.cardMeta}>
                        {done ? 'Completed' : `${completedCount} of ${item.targetSessions ?? '∞'}`}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <Pressable onPress={() => setMenuHabit(item)} hitSlop={10}>
                    <MaterialIcons name="more-vert" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <ActionSheet visible={!!menuHabit} title={menuHabit?.name} items={menuItems} onClose={() => setMenuHabit(null)} />
      {pauseHabit && (
        <PauseHabitModal
          visible
          today={today}
          onSave={(from, until) => {
            setPauses(pauseHabit.id, withPause(pauseHabit.pauses ?? [], from, until)).catch(errorAlert);
            setPauseHabit(null);
          }}
          onClose={() => setPauseHabit(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  count: { color: colors.textMuted, fontSize: font.sm },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  addBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  list: { padding: spacing.lg },
  sep: { height: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cardMain: { flex: 1, gap: 4 },
  cardName: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  cardDesc: { color: colors.textDim, fontSize: font.sm },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
  cardMeta: { color: colors.textDim, fontSize: font.sm },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
