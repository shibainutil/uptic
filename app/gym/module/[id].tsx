import { useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { useModules, useExercises } from '../../../src/store/gymStore';
import { Modal } from '../../../src/components/ui/Modal';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { Picker } from '../../../src/components/ui/Picker';
import { colors, spacing, font, radius } from '../../../src/theme';
import type { ExerciseExecution } from '../../../src/types/gym';

const EMPTY_FORM = { exerciseId: '', sets: '3', reps: '10', weight: '', weightUnit: 'kg' as 'kg' | 'lbs', notes: '' };

export default function ModuleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { modules, update, addExecution, updateExecution, removeExecution } = useModules(user!.uid);
  const { exercises } = useExercises(user!.uid);

  const mod = modules.find((m) => m.id === id);

  const [addModal, setAddModal] = useState(false);
  const [editExec, setEditExec] = useState<ExerciseExecution | null>(null);
  const [editNameModal, setEditNameModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [nameForm, setNameForm] = useState({ name: '', description: '' });

  if (!mod) return null;

  function openAdd() {
    setForm({ ...EMPTY_FORM, exerciseId: exercises[0]?.id ?? '' });
    setAddModal(true);
  }

  function openEdit(exec: ExerciseExecution) {
    setForm({
      exerciseId: exec.exerciseId,
      sets: String(exec.sets),
      reps: String(exec.reps),
      weight: exec.weight != null ? String(exec.weight) : '',
      weightUnit: exec.weightUnit ?? 'kg',
      notes: exec.notes ?? '',
    });
    setEditExec(exec);
  }

  async function saveAdd() {
    if (!form.exerciseId) return;
    await addExecution(mod!.id, {
      exerciseId: form.exerciseId,
      sets: parseInt(form.sets) || 1,
      reps: parseInt(form.reps) || 1,
      weight: form.weight ? parseFloat(form.weight) : undefined,
      weightUnit: form.weight ? form.weightUnit : undefined,
      notes: form.notes.trim() || undefined,
    });
    setAddModal(false);
  }

  async function saveEdit() {
    if (!editExec) return;
    await updateExecution(mod!.id, editExec.id, {
      exerciseId: form.exerciseId,
      sets: parseInt(form.sets) || 1,
      reps: parseInt(form.reps) || 1,
      weight: form.weight ? parseFloat(form.weight) : undefined,
      weightUnit: form.weight ? form.weightUnit : undefined,
      notes: form.notes.trim() || undefined,
    }, mod!.executions);
    setEditExec(null);
  }

  function confirmRemove(exec: ExerciseExecution) {
    Alert.alert('Remove Exercise', 'Remove this exercise from the module?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeExecution(mod!.id, exec.id, mod!.executions) },
    ]);
  }

  const exerciseName = (eid: string) => exercises.find((e) => e.id === eid)?.name ?? 'Unknown';

  const ExecForm = ({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) => (
    <View style={styles.form}>
      <View style={styles.formField}>
        <Text style={styles.formLabel}>Exercise</Text>
        <View style={styles.exercisePicker}>
          {exercises.map((ex) => (
            <Pressable
              key={ex.id}
              onPress={() => setForm({ ...form, exerciseId: ex.id })}
              style={[styles.exChip, form.exerciseId === ex.id && styles.exChipActive]}
            >
              <Text style={[styles.exChipText, form.exerciseId === ex.id && styles.exChipTextActive]}>{ex.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.row2}>
        <Input label="Sets" value={form.sets} onChangeText={(v) => setForm({ ...form, sets: v })} keyboardType="numeric" style={styles.flex1} />
        <Input label="Reps" value={form.reps} onChangeText={(v) => setForm({ ...form, reps: v })} keyboardType="numeric" style={styles.flex1} />
      </View>
      <View style={styles.row2}>
        <Input label="Weight (optional)" value={form.weight} onChangeText={(v) => setForm({ ...form, weight: v })} keyboardType="decimal-pad" style={styles.flex1} />
        <View style={styles.unitPicker}>
          <Text style={styles.formLabel}>Unit</Text>
          <Picker options={['kg', 'lbs']} value={form.weightUnit} onChange={(v) => setForm({ ...form, weightUnit: v as 'kg' | 'lbs' })} />
        </View>
      </View>
      <Input label="Notes (optional)" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} placeholder="Any notes" />
      <View style={styles.row2}>
        <Button label="Cancel" onPress={onCancel} style={styles.flex1} />
        <Button label="Save" variant="primary" onPress={onSave} disabled={!form.exerciseId} style={styles.flex1} />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{mod.name}</Text>
          {mod.description ? <Text style={styles.headerSub}>{mod.description}</Text> : null}
        </View>
        <Pressable onPress={() => { setNameForm({ name: mod.name, description: mod.description ?? '' }); setEditNameModal(true); }}>
          <Text style={styles.editBtn}>Edit</Text>
        </Pressable>
      </View>

      {exercises.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Add exercises in the Exercises tab first.</Text>
        </View>
      ) : (
        <FlatList
          data={mod.executions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💪</Text>
              <Text style={styles.emptyText}>No exercises in this module yet.</Text>
            </View>
          }
          ListFooterComponent={
            <Pressable onPress={openAdd} style={styles.addRow}>
              <Text style={styles.addRowText}>+ Add Exercise</Text>
            </Pressable>
          }
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <Text style={styles.cardIndex}>#{index + 1}</Text>
                <Text style={styles.cardName}>{exerciseName(item.exerciseId)}</Text>
                <Text style={styles.cardMeta}>
                  {item.sets} sets × {item.reps} reps
                  {item.weight != null ? `  ·  ${item.weight} ${item.weightUnit}` : ''}
                </Text>
                {item.notes ? <Text style={styles.cardNotes}>{item.notes}</Text> : null}
              </View>
              <View style={styles.cardActions}>
                <Pressable onPress={() => openEdit(item)} hitSlop={8}>
                  <Text style={styles.actionEdit}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => confirmRemove(item)} hitSlop={8}>
                  <Text style={styles.actionDelete}>Remove</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Modal title="Add Exercise" visible={addModal} onClose={() => setAddModal(false)}>
        <ExecForm onSave={saveAdd} onCancel={() => setAddModal(false)} />
      </Modal>
      <Modal title="Edit Exercise" visible={editExec !== null} onClose={() => setEditExec(null)}>
        <ExecForm onSave={saveEdit} onCancel={() => setEditExec(null)} />
      </Modal>
      <Modal title="Edit Module" visible={editNameModal} onClose={() => setEditNameModal(false)}>
        <View style={styles.form}>
          <Input label="Name" value={nameForm.name} onChangeText={(v) => setNameForm({ ...nameForm, name: v })} autoFocus />
          <Input label="Description (optional)" value={nameForm.description} onChangeText={(v) => setNameForm({ ...nameForm, description: v })} />
          <View style={styles.row2}>
            <Button label="Cancel" onPress={() => setEditNameModal(false)} style={styles.flex1} />
            <Button label="Save" variant="primary" onPress={async () => { await update(mod!.id, { name: nameForm.name.trim(), description: nameForm.description.trim() || undefined }); setEditNameModal(false); }} disabled={!nameForm.name.trim()} style={styles.flex1} />
          </View>
        </View>
      </Modal>
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
  },
  back: { marginRight: spacing.md },
  backText: { color: colors.accent, fontSize: font.md },
  headerCenter: { flex: 1 },
  headerTitle: { color: colors.text, fontSize: font.lg, fontWeight: '600' },
  headerSub: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  editBtn: { color: colors.accent, fontSize: font.sm },
  list: { padding: spacing.lg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIcon: { fontSize: 40 },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.lg,
  },
  cardLeft: { flex: 1 },
  cardIndex: { color: colors.textDim, fontSize: font.sm, marginBottom: 2 },
  cardName: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  cardMeta: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  cardNotes: { color: colors.textDim, fontSize: font.sm, marginTop: 4 },
  cardActions: { gap: spacing.md },
  actionEdit: { color: colors.accent, fontSize: font.sm },
  actionDelete: { color: colors.danger, fontSize: font.sm },
  addRow: {
    marginTop: spacing.md,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addRowText: { color: colors.textMuted, fontSize: font.md },
  form: { gap: spacing.lg },
  formField: { gap: spacing.xs },
  formLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  exercisePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  exChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  exChipActive: { borderColor: colors.accent, backgroundColor: `${colors.accent}22` },
  exChipText: { color: colors.textMuted, fontSize: font.sm },
  exChipTextActive: { color: colors.accent },
  row2: { flexDirection: 'row', gap: spacing.md },
  unitPicker: { gap: spacing.xs },
  flex1: { flex: 1 },
});
