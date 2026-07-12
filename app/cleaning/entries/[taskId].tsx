import { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useCleaningTasks, useCleaningLogEntries } from '../../../src/store/cleaningStore';
import { LogEntryModal } from '../../../src/components/cleaning/LogEntryModal';
import { colors, spacing, font, radius } from '../../../src/theme';
import type { CleaningLogEntry } from '../../../src/types/cleaning';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function CleaningEntriesScreen() {
  const { taskId, variant } = useLocalSearchParams<{ taskId: string; variant?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { tasks } = useCleaningTasks(user?.uid);
  const { entries, add, update, remove } = useCleaningLogEntries(user?.uid);

  const task = tasks.find((t) => t.id === taskId);
  const v = variant === 'normal' || variant === 'deep' ? variant : undefined;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CleaningLogEntry | undefined>(undefined);

  const taskEntries = entries
    .filter((e) => e.taskId === taskId && e.variant === v)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));

  function openNew() {
    setEditing(undefined);
    setModalOpen(true);
  }
  function openEdit(entry: CleaningLogEntry) {
    setEditing(entry);
    setModalOpen(true);
  }
  function save(loggedAt: string, notes: string) {
    if (editing) {
      update(editing.id, { loggedAt, notes: notes || undefined });
    } else {
      add({ taskId: taskId!, variant: v, loggedAt, notes: notes || undefined });
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

  const title = task
    ? `${task.name}${v ? ` · ${v === 'deep' ? 'Deep clean' : 'Normal clean'}` : ''}`
    : 'Sessions';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <Pressable onPress={openNew} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Log</Text>
        </Pressable>
      </View>

      {taskEntries.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="event-note" size={48} color={colors.textDim} />
          <Text style={styles.emptyText}>No sessions logged yet.</Text>
        </View>
      ) : (
        <FlatList
          data={taskEntries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openEdit(item)}>
              <View style={styles.rowMain}>
                <Text style={styles.rowDate}>{formatDateTime(item.loggedAt)}</Text>
                {item.notes ? <Text style={styles.rowNotes} numberOfLines={2}>{item.notes}</Text> : null}
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
          )}
        />
      )}

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

const styles = StyleSheet.create({
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
  list: { padding: spacing.lg },
  sep: { height: 8 },
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
