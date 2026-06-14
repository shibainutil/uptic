import { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, SectionList, StyleSheet, Alert,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useExercises } from '../../store/gymStore';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Picker } from '../ui/Picker';
import { colors, spacing, font, radius } from '../../theme';
import type { Exercise } from '../../types/gym';

const CATEGORIES = ['Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Legs', 'Cardio', 'Other'];

const EMPTY_FORM = { name: '', category: 'Other', description: '' };

export function ExercisesTab() {
  const { user } = useAuth();
  const { exercises, add, update, remove } = useExercises(user?.uid);

  const [modal, setModal] = useState<'add' | Exercise | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  function openAdd() {
    setForm(EMPTY_FORM);
    setModal('add');
  }

  function openEdit(ex: Exercise) {
    setForm({ name: ex.name, category: ex.category, description: ex.description ?? '' });
    setModal(ex);
  }

  async function save() {
    if (!form.name.trim()) return;
    if (modal === 'add') {
      await add({ name: form.name.trim(), category: form.category, description: form.description.trim() || undefined });
    } else if (modal && typeof modal === 'object') {
      await update(modal.id, { name: form.name.trim(), category: form.category, description: form.description.trim() || undefined });
    }
    setModal(null);
  }

  function confirmDelete(ex: Exercise) {
    Alert.alert('Delete Exercise', `Remove "${ex.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(ex.id) },
    ]);
  }

  const sections = CATEGORIES
    .map((cat) => ({ title: cat, data: exercises.filter((e) => e.category === cat) }))
    .filter((s) => s.data.length > 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.count}>{exercises.length} exercise{exercises.length !== 1 ? 's' : ''}</Text>
        <Pressable onPress={openAdd} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {exercises.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏋️</Text>
          <Text style={styles.emptyText}>No exercises yet.{'\n'}Add your first one.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{item.name}</Text>
                {item.description ? <Text style={styles.rowDesc}>{item.description}</Text> : null}
              </View>
              <View style={styles.rowActions}>
                <Pressable onPress={() => openEdit(item)} hitSlop={8}>
                  <Text style={styles.actionEdit}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(item)} hitSlop={8}>
                  <Text style={styles.actionDelete}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}

      <Modal
        title={modal === 'add' ? 'Add Exercise' : 'Edit Exercise'}
        visible={modal !== null}
        onClose={() => setModal(null)}
      >
        <View style={styles.form}>
          <Input
            label="Name"
            value={form.name}
            onChangeText={(v) => setForm({ ...form, name: v })}
            placeholder="e.g. Bench Press"
            autoFocus
          />
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Category</Text>
            <Picker options={CATEGORIES} value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
          </View>
          <Input
            label="Description (optional)"
            value={form.description}
            onChangeText={(v) => setForm({ ...form, description: v })}
            placeholder="Notes about this exercise"
          />
          <View style={styles.formRow}>
            <Button label="Cancel" onPress={() => setModal(null)} style={styles.flex1} />
            <Button label="Save" variant="primary" onPress={save} disabled={!form.name.trim()} style={styles.flex1} />
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
  list: { padding: spacing.lg, gap: spacing.md },
  sectionHeader: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowMain: { flex: 1 },
  rowName: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  rowDesc: { color: colors.textDim, fontSize: font.sm, marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: spacing.lg },
  actionEdit: { color: colors.accent, fontSize: font.sm },
  actionDelete: { color: colors.danger, fontSize: font.sm },
  sep: { height: 4 },
  form: { gap: spacing.lg },
  formField: { gap: spacing.xs },
  formLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  formRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex1: { flex: 1 },
});
