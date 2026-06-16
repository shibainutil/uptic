import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Picker } from '../ui/Picker';
import { DatePicker } from '../ui/DatePicker';
import { colors, spacing, font, radius } from '../../theme';
import { todayISO } from '../../lib/schedule';
import { type Exercise, type ExerciseExecution, type ParamValue, type SeriesEntry, exerciseType } from '../../types/gym';

interface SeriesRow {
  reps: string;
  weight: string;
}

interface ExecForm {
  date: string;
  seriesRows: SeriesRow[];
  weightUnit: 'kg' | 'lbs';
  durationMin: string;
  paramValues: Record<string, string>;
  notes: string;
}

interface Props {
  exercise: Exercise;
  execution: ExerciseExecution | null;
  visible: boolean;
  defaultDate?: string;
  defaultCompleted?: boolean;
  routineExecutionId?: string;
  lockDate?: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<ExerciseExecution, 'id' | 'createdAt'>) => void | Promise<void>;
}

function isSeriesDone(row: SeriesRow): boolean {
  return row.reps.trim() !== '' && row.weight.trim() !== '';
}

export function ExecutionFormModal({
  exercise, execution, visible, defaultDate, routineExecutionId, lockDate, onClose, onSubmit,
}: Props) {
  const isStrength = exerciseType(exercise) === 'strength';
  const params = exercise.params ?? [];
  const requiredParams = params.filter((p) => p.required);
  const [form, setForm] = useState<ExecForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const seriesCount = exercise.series ?? 3;
    const pv: Record<string, string> = {};

    if (execution) {
      (execution.paramValues ?? []).forEach((p) => { pv[p.paramId] = p.value; });

      let seriesRows: SeriesRow[];
      if (execution.seriesData && execution.seriesData.length > 0) {
        // Pad or trim to current exercise series count.
        seriesRows = Array.from({ length: seriesCount }, (_, i) => {
          const s = execution.seriesData![i];
          return { reps: s?.reps != null ? String(s.reps) : '', weight: s?.weight != null ? String(s.weight) : '' };
        });
      } else {
        // Legacy single-value execution: pre-fill first series.
        seriesRows = Array.from({ length: seriesCount }, (_, i) => ({
          reps: i === 0 && execution.reps != null ? String(execution.reps) : '',
          weight: i === 0 && execution.weight != null ? String(execution.weight) : '',
        }));
      }

      setForm({
        date: execution.date,
        seriesRows,
        weightUnit: execution.weightUnit ?? 'kg',
        durationMin: String(execution.durationMin ?? exercise.durationMin ?? 30),
        paramValues: pv,
        notes: execution.notes ?? '',
      });
    } else {
      setForm({
        date: defaultDate ?? todayISO(),
        seriesRows: Array.from({ length: seriesCount }, () => ({ reps: '', weight: '' })),
        weightUnit: 'kg',
        durationMin: String(exercise.durationMin ?? 30),
        paramValues: {},
        notes: '',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, execution]);

  function updateRow(index: number, field: keyof SeriesRow, value: string) {
    if (!form) return;
    const rows = form.seriesRows.map((r, i) => i === index ? { ...r, [field]: value } : r);
    setForm({ ...form, seriesRows: rows });
  }

  const allSeriesDone = form ? form.seriesRows.every(isSeriesDone) : false;
  const missingRequired = form
    ? requiredParams.filter((p) => !(form.paramValues[p.id] ?? '').trim()).map((p) => p.name)
    : [];
  const canComplete = allSeriesDone && missingRequired.length === 0;

  async function save() {
    if (!form || saving) return;
    if (isStrength && !canComplete && missingRequired.length > 0) {
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
      completed: isStrength ? canComplete : true,
      notes: form.notes.trim() || undefined,
      ...(routineExecutionId ? { routineExecutionId } : {}),
    };

    if (isStrength) {
      const seriesData: SeriesEntry[] = form.seriesRows.map((r) => ({
        reps: r.reps.trim() ? parseInt(r.reps) : undefined,
        weight: r.weight.trim() ? parseFloat(r.weight) : undefined,
        weightUnit: form.weightUnit,
      }));
      data.seriesData = seriesData;
      data.series = form.seriesRows.length;
      // Legacy fields for backward compat with TrackerTab summary.
      const first = seriesData[0];
      if (first) {
        data.reps = first.reps;
        data.weight = first.weight;
        data.weightUnit = form.weightUnit;
      }
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

  const doneSeries = form ? form.seriesRows.filter(isSeriesDone).length : 0;
  const totalSeries = form?.seriesRows.length ?? 0;

  return (
    <Modal title={execution ? 'Edit Execution' : 'Log Execution'} visible={visible} onClose={onClose}>
      {form && (
        <View style={styles.form}>
          {!lockDate && (
            <DatePicker label="Date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
          )}

          {isStrength ? (
            <>
              <View style={styles.unitRow}>
                <Text style={styles.formLabel}>Weight unit</Text>
                <Picker
                  options={['kg', 'lbs']}
                  value={form.weightUnit}
                  onChange={(v) => setForm({ ...form, weightUnit: v as 'kg' | 'lbs' })}
                />
              </View>

              <View style={styles.seriesHeader}>
                <Text style={styles.seriesColLabel} />
                <Text style={[styles.seriesColLabel, styles.seriesColInput]}>Reps</Text>
                <Text style={[styles.seriesColLabel, styles.seriesColInput]}>Weight ({form.weightUnit})</Text>
                <View style={styles.seriesCheckCol} />
              </View>

              {form.seriesRows.map((row, i) => {
                const done = isSeriesDone(row);
                return (
                  <View key={i} style={styles.seriesRow}>
                    <Text style={styles.seriesLabel}>Series {i + 1}</Text>
                    <Input
                      value={row.reps}
                      onChangeText={(v) => updateRow(i, 'reps', v)}
                      keyboardType="numeric"
                      placeholder="—"
                      style={styles.seriesInput}
                    />
                    <Input
                      value={row.weight}
                      onChangeText={(v) => updateRow(i, 'weight', v)}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      style={styles.seriesInput}
                    />
                    <View style={styles.seriesCheckCol}>
                      <MaterialIcons
                        name={done ? 'check-circle' : 'radio-button-unchecked'}
                        size={22}
                        color={done ? '#22C55E' : colors.textDim}
                      />
                    </View>
                  </View>
                );
              })}

              <Text style={styles.progressNote}>
                {doneSeries}/{totalSeries} series done
                {doneSeries === totalSeries && totalSeries > 0 ? ' — exercise complete ✓' : ''}
              </Text>
            </>
          ) : (
            <Input
              label="Duration (minutes)"
              value={form.durationMin}
              onChangeText={(v) => setForm({ ...form, durationMin: v })}
              keyboardType="numeric"
            />
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

          {missingRequired.length > 0 && (
            <Text style={styles.warn}>Required: {missingRequired.join(', ')}</Text>
          )}

          <Input
            label="Notes (optional)"
            value={form.notes}
            onChangeText={(v) => setForm({ ...form, notes: v })}
            placeholder="Any notes"
          />

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
  formLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  unitRow: { gap: spacing.xs },
  seriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 2,
  },
  seriesColLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, width: 64,
  },
  seriesColInput: { flex: 1 },
  seriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  seriesLabel: { width: 64, color: colors.text, fontSize: font.sm, fontWeight: '500' },
  seriesInput: { flex: 1 },
  seriesCheckCol: { width: 28, alignItems: 'center' },
  progressNote: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  warn: { color: colors.danger, fontSize: font.sm },
  flex1: { flex: 1 },
  formRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
