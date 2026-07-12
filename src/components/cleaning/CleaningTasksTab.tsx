import { View, Text, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useCleaningTasks, useCleaningLogEntries } from '../../store/cleaningStore';
import { describeCleaningSchedule } from '../../lib/cleaningSchedule';
import { fromISO } from '../../lib/schedule';
import { colors, spacing, font, radius } from '../../theme';

const DEEP_COLOR = '#A855F7'; // kept independent of colors.accent, matches gym's reschedule-purple convention

export function CleaningTasksTab() {
  const { user } = useAuth();
  const { tasks, remove } = useCleaningTasks(user?.uid);
  const { entries } = useCleaningLogEntries(user?.uid);
  const router = useRouter();

  function confirmDelete(id: string, name: string) {
    Alert.alert('Delete Task', `Remove "${name}"? Its logged sessions will also be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(id) },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.count}>{tasks.length} task{tasks.length !== 1 ? 's' : ''}</Text>
        <Pressable onPress={() => router.push('/cleaning/task/new')} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {tasks.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="cleaning-services" size={48} color={colors.textDim} />
          <Text style={styles.emptyText}>No cleaning tasks yet.{'\n'}Create one with a schedule.</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            const completedCount = entries.filter((e) => e.taskId === item.id && !e.variant).length;
            return (
              <Pressable style={styles.card} onPress={() => router.push(`/cleaning/task/${item.id}`)}>
                <View style={styles.cardMain}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
                  <View style={styles.cardMetaRow}>
                    {item.kind === 'periodic' ? (
                      <>
                        {item.normalSchedule && (
                          <View style={styles.badge}>
                            <MaterialIcons name="event-repeat" size={13} color={colors.accent} />
                            <Text style={styles.badgeText}>{describeCleaningSchedule(item.normalSchedule)}</Text>
                          </View>
                        )}
                        {item.deepSchedule && (
                          <View style={[styles.badge, styles.deepBadge]}>
                            <MaterialIcons name="auto-awesome" size={13} color={DEEP_COLOR} />
                            <Text style={[styles.badgeText, styles.deepBadgeText]}>
                              Deep · {describeCleaningSchedule(item.deepSchedule)}
                            </Text>
                          </View>
                        )}
                      </>
                    ) : (
                      <Text style={styles.cardMeta}>
                        {completedCount} of {item.targetSessions ?? 0}
                        {item.targetDate
                          ? ` by ${fromISO(item.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                          : ''}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <Pressable onPress={() => confirmDelete(item.id, item.name)} hitSlop={8}>
                    <Text style={styles.actionDelete}>Delete</Text>
                  </Pressable>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Pressable>
            );
          }}
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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.accent}1A`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  deepBadge: { backgroundColor: `${DEEP_COLOR}1A` },
  deepBadgeText: { color: DEEP_COLOR },
  badgeText: { color: colors.accent, fontSize: font.sm, fontWeight: '500' },
  cardMeta: { color: colors.textDim, fontSize: font.sm },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionDelete: { color: colors.danger, fontSize: font.sm },
  chevron: { color: colors.textMuted, fontSize: 20 },
});
