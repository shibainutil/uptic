import { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useModules } from '../../store/gymStore';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { colors, spacing, font, radius } from '../../theme';

const EMPTY_FORM = { name: '', description: '' };

export function ModulesTab() {
  const { user } = useAuth();
  const { modules, add, remove } = useModules(user?.uid);
  const router = useRouter();

  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  async function save() {
    if (!form.name.trim()) return;
    await add({ name: form.name.trim(), description: form.description.trim() || undefined, executions: [] });
    setForm(EMPTY_FORM);
    setAddModal(false);
  }

  function confirmDelete(id: string, name: string) {
    Alert.alert('Delete Module', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(id) },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.count}>{modules.length} module{modules.length !== 1 ? 's' : ''}</Text>
        <Pressable onPress={() => setAddModal(true)} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {modules.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No training modules yet.{'\n'}Create one to group exercises.</Text>
        </View>
      ) : (
        <FlatList
          data={modules}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/gym/module/${item.id}`)}
            >
              <View style={styles.cardMain}>
                <Text style={styles.cardName}>{item.name}</Text>
                {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
                <Text style={styles.cardMeta}>{item.executions.length} exercise{item.executions.length !== 1 ? 's' : ''}</Text>
              </View>
              <View style={styles.cardActions}>
                <Pressable onPress={() => confirmDelete(item.id, item.name)} hitSlop={8}>
                  <Text style={styles.actionDelete}>Delete</Text>
                </Pressable>
                <Text style={styles.chevron}>›</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal title="New Training Module" visible={addModal} onClose={() => setAddModal(false)}>
        <View style={styles.form}>
          <Input label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. Push Day A" autoFocus />
          <Input label="Description (optional)" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Notes about this module" />
          <View style={styles.formRow}>
            <Button label="Cancel" onPress={() => setAddModal(false)} style={styles.flex1} />
            <Button label="Create" variant="primary" onPress={save} disabled={!form.name.trim()} style={styles.flex1} />
          </View>
        </View>
      </Modal>
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
  emptyIcon: { fontSize: 48 },
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
  cardMain: { flex: 1 },
  cardName: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  cardDesc: { color: colors.textDim, fontSize: font.sm, marginTop: 2 },
  cardMeta: { color: colors.textDim, fontSize: font.sm, marginTop: 4 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionDelete: { color: colors.danger, fontSize: font.sm },
  chevron: { color: colors.textMuted, fontSize: 20 },
  form: { gap: spacing.lg },
  formRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex1: { flex: 1 },
});
