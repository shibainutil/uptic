import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, Alert,
  Modal as RNModal, Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { DatePicker } from '../ui/DatePicker';
import { colors, spacing, font, radius } from '../../theme';
import { todayISO } from '../../lib/schedule';
import {
  type Exercise, type ExerciseExecution, type ParamValue, type SeriesEntry, exerciseType,
} from '../../types/gym';

interface SeriesRow {
  reps: string;
  weight: string;
}

interface ExecForm {
  date: string;
  seriesRows: SeriesRow[];
  durationMin: string;
  paramValues: Record<string, string>;
}

interface Props {
  exercise: Exercise;
  execution: ExerciseExecution | null;
  // Most recent prior execution for this exercise — used for weight placeholders.
  lastExecution?: ExerciseExecution | null;
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
  exercise, execution, lastExecution, visible, defaultDate, routineExecutionId, lockDate, onClose, onSubmit,
}: Props) {
  const isStrength = exerciseType(exercise) === 'strength';
  const params = exercise.params ?? [];
  const requiredParams = params.filter((p) => p.required);
  const [form, setForm] = useState<ExecForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  // Per-series weight placeholders: all slots show the last series weight from previous execution.
  const weightPlaceholders: string[] = (() => {
    const src = lastExecution ?? execution;
    if (!src) return [];
    const count = exercise.series ?? 3;
    let lastWeight: number | undefined;
    if (src.seriesData && src.seriesData.length > 0) {
      const lastEntry = [...src.seriesData].reverse().find((s) => s.weight != null);
      lastWeight = lastEntry?.weight;
    } else {
      lastWeight = src.weight ?? undefined;
    }
    const placeholder = lastWeight != null ? String(lastWeight) : '';
    return Array.from({ length: count }, () => placeholder);
  })();

  const repsSuggestion = exercise.repsMin != null
    ? exercise.repsMin === exercise.repsMax
      ? String(exercise.repsMin)
      : `${exercise.repsMin}`
    : '';

  useEffect(() => {
    if (!visible) return;
    const seriesCount = exercise.series ?? 3;
    const pv: Record<string, string> = {};

    if (execution) {
      (execution.paramValues ?? []).forEach((p) => { pv[p.paramId] = p.value; });

      let seriesRows: SeriesRow[];
      if (execution.seriesData && execution.seriesData.length > 0) {
        seriesRows = Array.from({ length: seriesCount }, (_, i) => {
          const s = execution.seriesData![i];
          return { reps: s?.reps != null ? String(s.reps) : '', weight: s?.weight != null ? String(s.weight) : '' };
        });
      } else {
        seriesRows = Array.from({ length: seriesCount }, (_, i) => ({
          reps: i === 0 && execution.reps != null ? String(execution.reps) : '',
          weight: i === 0 && execution.weight != null ? String(execution.weight) : '',
        }));
      }

      setForm({
        date: execution.date,
        seriesRows,
        durationMin: String(execution.durationMin ?? exercise.durationMin ?? 30),
        paramValues: pv,
      });
    } else {
      setForm({
        date: defaultDate ?? todayISO(),
        seriesRows: Array.from({ length: seriesCount }, () => ({ reps: '', weight: '' })),
        durationMin: String(exercise.durationMin ?? 30),
        paramValues: {},
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
    if (isStrength && missingRequired.length > 0 && allSeriesDone) {
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
      ...(routineExecutionId ? { routineExecutionId } : {}),
    };

    if (isStrength) {
      const seriesData: SeriesEntry[] = form.seriesRows.map((r) => {
        const entry: SeriesEntry = { weightUnit: 'kg' };
        if (r.reps.trim()) entry.reps = parseInt(r.reps);
        if (r.weight.trim()) entry.weight = parseFloat(r.weight);
        return entry;
      });
      data.seriesData = seriesData;
      data.series = form.seriesRows.length;
      const first = seriesData[0];
      if (first?.reps != null) data.reps = first.reps;
      if (first?.weight != null) { data.weight = first.weight; data.weightUnit = 'kg'; }
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
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.exerciseName}>{exercise.name}</Text>
              {form && <Text style={styles.dateText}>{form.date}</Text>}
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {form && (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
              {!lockDate && (
                <DatePicker label="Date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
              )}

              {isStrength ? (
                <View style={styles.grid}>
                  {/* Weight row */}
                  <View style={styles.gridRow}>
                    <Text style={styles.rowLabel}>Weight{'\n'}(kg)</Text>
                    {form.seriesRows.map((row, i) => (
                      <TextInput
                        key={i}
                        style={[styles.cell, focused === `w${i}` && styles.cellFocused]}
                        value={row.weight}
                        onChangeText={(v) => updateRow(i, 'weight', v)}
                        onFocus={() => setFocused(`w${i}`)}
                        onBlur={() => setFocused(null)}
                        keyboardType="decimal-pad"
                        placeholder={weightPlaceholders[i] || '—'}
                        placeholderTextColor={weightPlaceholders[i] ? colors.textMuted : colors.textDim}
                      />
                    ))}
                  </View>

                  {/* Reps row */}
                  <View style={styles.gridRow}>
                    <Text style={styles.rowLabel}>Reps</Text>
                    {form.seriesRows.map((row, i) => (
                      <TextInput
                        key={i}
                        style={[styles.cell, focused === `r${i}` && styles.cellFocused]}
                        value={row.reps}
                        onChangeText={(v) => updateRow(i, 'reps', v)}
                        onFocus={() => setFocused(`r${i}`)}
                        onBlur={() => setFocused(null)}
                        keyboardType="numeric"
                        placeholder={repsSuggestion || '—'}
                        placeholderTextColor={repsSuggestion ? colors.textMuted : colors.textDim}
                      />
                    ))}
                  </View>

                  {/* Checkmarks row */}
                  <View style={styles.gridRow}>
                    <View style={styles.labelCell} />
                    {form.seriesRows.map((row, i) => {
                      const done = isSeriesDone(row);
                      return (
                        <View key={i} style={styles.checkCell}>
                          <MaterialIcons
                            name={done ? 'check-circle' : 'radio-button-unchecked'}
                            size={18}
                            color={done ? '#22C55E' : colors.textDim}
                          />
                        </View>
                      );
                    })}
                  </View>
                </View>
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

              <View style={styles.formRow}>
                <Button label="Cancel" onPress={onClose} style={styles.flex1} disabled={saving} />
                <Button label="Save" variant="primary" onPress={save} disabled={saving} style={styles.flex1} />
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

const LABEL_W = 52;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  headerText: { flex: 1, gap: 2 },
  exerciseName: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  dateText: { color: colors.textMuted, fontSize: font.sm },
  body: { padding: spacing.lg, gap: spacing.lg },
  grid: { gap: spacing.sm },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  labelCell: { width: LABEL_W },
  rowLabel: {
    width: LABEL_W,
    color: colors.textMuted,
    fontSize: font.sm,
    lineHeight: 17,
  },
  cell: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    color: colors.text,
    fontSize: font.md,
  },
  cellFocused: {
    borderColor: colors.accent,
  },
  checkCell: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  warn: { color: colors.danger, fontSize: font.sm },
  flex1: { flex: 1 },
  formRow: { flexDirection: 'row', gap: spacing.md },
});
