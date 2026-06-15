import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Picker } from '../ui/Picker';
import { Toggle } from '../ui/Toggle';
import { DatePicker } from '../ui/DatePicker';
import { colors, spacing, font } from '../../theme';
import { todayISO } from '../../lib/schedule';
import { type Exercise, type ExerciseExecution, type ParamValue, exerciseType } from '../../types/gym';

interface ExecForm {
  date: string;
  series: string;
  reps: string;
  durationMin: string;
  weight: string;
  weightUnit: 'kg' | 'lbs';
  paramValues: Record<string, string>;
  notes: string;
  completed: boolean;
}

interface Props {
  exercise: Exercise;
  execution: ExerciseExecution | null; // null = creating a new one
  visible: boolean;
  defaultDate?: string;
  defaultCompleted?: boolean;
  routineExecutionId?: string;
  /** Hide the date picker (e.g. when the date is fixed by a routine execution). */
  lockDate?: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<ExerciseExecution, 'id' | 'createdAt'>) => void | Promise<void>;
}

export function ExecutionFormModal({
  exercise, execution, visible, defaultDate, defaultCompleted, routineExecutionId, lockDate, onClose, onSubmit,
}: Props) {
  const isStrength = exerciseType(exercise) === 'strength';
  const params = exercise.params ?? [];
  const requiredParams = params.filter((p) => p.required);
  const [form, setForm] = useState<ExecForm | null>(null);
  const [saving, setSaving] = useState(false);

  // (Re)initialize the form whenever the modal opens.
  useEffect(() => {
    if (!visible) return;
    if (execution) {
      const pv: Record<string, string> = {};
      (execution.paramValues ?? []).forEach((p) => { pv[p.paramId] = p.value; });
      setForm({
        date: execution.date,
        series: String(execution.series ?? exercise.series ?? 3),
        reps: String(execution.reps ?? exercise.repsMin ?? 8),
        durationMin: String(execution.durationMin ?? exercise.durationMin ?? 30),
        weight: execution.weight != null ? String(execution.weight) : '',
        weightUnit: execution.weightUnit ?? 'kg',
        paramValues: pv,
        notes: execution.notes ?? '',
        completed: execution.completed,
      });
    } else {
      setForm({
        date: defaultDate ?? todayISO(),
        series: String(exercise.series ?? 3),
        reps: String(exercise.repsMin ?? 8),
        durationMin: String(exercise.durationMin ?? 30),
        weight: '',
        weightUnit: 'kg',
        paramValues: {},
        notes: '',
        completed: defaultCompleted ?? false,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, execution]);

  const missingRequired = form
    ? requiredParams.filter((p) => !(form.paramValues[p.id] ?? '').trim()).map((p) => p.name)
    : [];

  async function save() {
    if (!form || saving) return;
    if (form.completed && missingRequired.length > 0) {
      Alert.alert('Cannot complete', `Fill required parameter(s): ${missingRequired.join(', ')}`);
      return;
    }
    const paramValues: ParamValue[] = params
      .map((p) => ({ paramId: p.id, value: (form.paramValues[p.id] ?? '').trim() }))
      .filter((p) => p.value);

    const data: Omit<ExerciseExecution, 'id' | 'createdAt'> = {
      exerciseId: exercise.id,
      date: form.date,
      paramValues,
      completed: form.completed,
      notes: form.notes.trim() || undefined,
      ...(routineExecutionId ? { routineExecutionId } : {}),
    };
    if (isStrength) {
      data.series = parseInt(form.series) || undefined;
      data.reps = parseInt(form.reps) || undefined;
      if (form.weight.trim()) { data.weight = parseFloat(form.weight); data.weightUnit = form.weightUnit; }
    } else {
      data.durationMin = parseInt(form.durationMin) || undefined;
    }

    setSaving(true);
    try {
      await onSubmit(data);
      onClose();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save execution.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={execution ? 'Edit Execution' : 'Log Execution'} visible={visible} onClose={onClose}>
      {form && (
        <View style={styles.form}>
          {!lockDate && (
            <DatePicker label="Date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
          )}

          {isStrength ? (
            <>
              <View style={styles.row3}>
                <Input label="Series" value={form.series} onChangeText={(v) => setForm({ ...form, series: v })} keyboardType="numeric" style={styles.flex1} />
                <Input label="Reps" value={form.reps} onChangeText={(v) => setForm({ ...form, reps: v })} keyboardType="numeric" style={styles.flex1} />
                <Input label="Weight" value={form.weight} onChangeText={(v) => setForm({ ...form, weight: v })} keyboardType="decimal-pad" placeholder="opt" style={styles.flex1} />
              </View>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Unit</Text>
                <Picker options={['kg', 'lbs']} value={form.weightUnit} onChange={(v) => setForm({ ...form, weightUnit: v as 'kg' | 'lbs' })} />
              </View>
            </>
          ) : (
            <Input label="Duration (minutes)" value={form.durationMin} onChangeText={(v) => setForm({ ...form, durationMin: v })} keyboardType="numeric" />
          )}

          {params.map((p) => (
            <Input
              key={p.id}
              label={`${p.name}${p.unit ? ` (${p.unit})` : ''}${p.required ? ' *' : ''}`}
              value={form.paramValues[p.id] ?? ''}
              onChangeText={(v) => setForm({ ...form, paramValues: { ...form.paramValues, [p.id]: v } })}
              placeholder={p.required ? 'Required' : 'Optional'}
            />
          ))}

          <Input label="Notes (optional)" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} placeholder="Any notes" />

          <View style={styles.completeRow}>
            <Toggle value={form.completed} onChange={(v) => setForm({ ...form, completed: v })} label="Mark as completed" />
          </View>
          {form.completed && missingRequired.length > 0 ? (
            <Text style={styles.warn}>Fill required: {missingRequired.join(', ')}</Text>
          ) : null}

          <View style={styles.formRow}>
            <Button label="Cancel" onPress={onClose} style={styles.flex1} disabled={saving} />
            <Button label="Save" variant="primary" onPress={save} disabled={saving} style={styles.flex1} />
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  formField: { gap: spacing.xs },
  formLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  row3: { flexDirection: 'row', gap: spacing.md },
  flex1: { flex: 1 },
  completeRow: { marginTop: spacing.xs },
  warn: { color: colors.danger, fontSize: font.sm },
  formRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
