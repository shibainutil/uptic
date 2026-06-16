import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, font, radius } from '../../theme';
import {
  type Exercise, type ExerciseExecution, type SeriesEntry, exerciseType,
} from '../../types/gym';

interface SeriesRow { weight: string; reps: string }

interface Props {
  exercise: Exercise;
  execution: ExerciseExecution | null;
  lastExecution: ExerciseExecution | null;
  routineExecutionId: string;
  dueDate: string;
  onSave: (data: Omit<ExerciseExecution, 'id' | 'createdAt'>) => Promise<void>;
}

function filterWeight(v: string): string {
  const digits = v.replace(/[^0-9.]/g, '');
  const dot = digits.indexOf('.');
  return dot === -1 ? digits : digits.slice(0, dot + 1) + digits.slice(dot + 1).replace(/\./g, '');
}

function filterReps(v: string): string {
  return v.replace(/[^0-9]/g, '');
}

function isValidWeight(s: string): boolean {
  return /^\d+(\.\d+)?$/.test(s.trim()) && s.trim() !== '';
}

function isValidReps(s: string): boolean {
  return /^\d+$/.test(s.trim()) && parseInt(s, 10) > 0;
}

function isSeriesDone(row: SeriesRow): boolean {
  return isValidWeight(row.weight) && isValidReps(row.reps);
}

const LABEL_W = 52;

export function ExerciseInlineForm({ exercise, execution, lastExecution, routineExecutionId, dueDate, onSave }: Props) {
  const isStrength = exerciseType(exercise) === 'strength';
  const seriesCount = exercise.series ?? 3;
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<SeriesRow[]>(() =>
    Array.from({ length: seriesCount }, () => ({ weight: '', reps: '' })),
  );
  const [focused, setFocused] = useState<string | null>(null);

  const executionRef = useRef(execution);
  useEffect(() => { executionRef.current = execution; }, [execution]);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // Queue: if a save is in flight, store the latest rows to save next
  const isSaving = useRef(false);
  const pendingSave = useRef<SeriesRow[] | null>(null);

  // Sync rows when execution prop changes (after Firestore update or on open)
  useEffect(() => {
    const count = exercise.series ?? 3;
    const fmt = (w: number | undefined) => w != null ? w.toFixed(1) : '';
    if (execution?.seriesData && execution.seriesData.length > 0) {
      setRows(Array.from({ length: count }, (_, i) => {
        const s = execution.seriesData![i];
        return { weight: fmt(s?.weight), reps: s?.reps != null ? String(s.reps) : '' };
      }));
    } else if (execution) {
      setRows(Array.from({ length: count }, (_, i) => ({
        weight: i === 0 ? fmt(execution.weight) : '',
        reps: i === 0 && execution.reps != null ? String(execution.reps) : '',
      })));
    } else {
      setRows(Array.from({ length: count }, () => ({ weight: '', reps: '' })));
    }
  }, [execution, exercise.series]);

  // Weight placeholders: per-series from lastExecution
  const weightPlaceholders: string[] = Array.from({ length: seriesCount }, (_, i) => {
    const src = lastExecution;
    if (!src) return '';
    if (src.seriesData && src.seriesData.length > 0) {
      const w = src.seriesData[i]?.weight;
      return w != null ? w.toFixed(1) : '';
    }
    return i === 0 && src.weight != null ? src.weight.toFixed(1) : '';
  });
  const repsSuggestion = exercise.repsMin != null ? String(exercise.repsMin) : '';

  function updateRow(i: number, field: keyof SeriesRow, raw: string) {
    const value = field === 'weight' ? filterWeight(raw) : filterReps(raw);
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function isEditable(i: number): boolean {
    if (i === 0) return true;
    return isSeriesDone(rows[i - 1]);
  }

  async function doSave(current: SeriesRow[]) {
    const anyDone = current.some(isSeriesDone);
    if (!anyDone) return;
    try {
      const seriesData: SeriesEntry[] = current.map((r) => {
        const entry: SeriesEntry = { weightUnit: 'kg' };
        if (isValidWeight(r.weight)) entry.weight = parseFloat(r.weight);
        if (isValidReps(r.reps)) entry.reps = parseInt(r.reps, 10);
        return entry;
      });
      const allDone = current.every(isSeriesDone);
      const data: Omit<ExerciseExecution, 'id' | 'createdAt'> = {
        exerciseId: exercise.id,
        date: dueDate,
        paramValues: executionRef.current?.paramValues ?? [],
        completed: isStrength ? allDone : true,
        routineExecutionId,
        seriesData,
        series: seriesCount,
        ...(seriesData[0]?.reps != null ? { reps: seriesData[0].reps } : {}),
        ...(seriesData[0]?.weight != null ? { weight: seriesData[0].weight, weightUnit: 'kg' as const } : {}),
      };
      await onSaveRef.current(data);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save.');
    }
  }

  // Queue-aware save: if already saving, queue the latest rows
  async function triggerSave(current: SeriesRow[]) {
    if (isSaving.current) {
      pendingSave.current = current;
      return;
    }
    isSaving.current = true;
    try {
      await doSave(current);
    } finally {
      isSaving.current = false;
      if (pendingSave.current) {
        const next = pendingSave.current;
        pendingSave.current = null;
        triggerSave(next);
      }
    }
  }

  function formatWeightOnBlur(i: number) {
    setFocused(null);
    setRows((prev) => {
      const next = prev.map((r, idx) => {
        if (idx !== i) return r;
        const n = parseFloat(r.weight);
        return { ...r, weight: isNaN(n) ? r.weight : n.toFixed(1) };
      });
      if (next.some(isSeriesDone)) {
        triggerSave(next);
      }
      return next;
    });
  }

  function onRepsBlur() {
    setFocused(null);
    setRows((prev) => {
      if (prev.some(isSeriesDone)) {
        triggerSave(prev);
      }
      return prev;
    });
  }

  const circles: boolean[] = rows.map(isSeriesDone);

  const meta = isStrength
    ? `${exercise.series ?? 3} × ${exercise.repsMin ?? 8}–${exercise.repsMax ?? 10}`
    : `${exercise.durationMin ?? 30} min`;

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={() => setExpanded((v) => !v)}>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={20}
          color={colors.textMuted}
        />
        <View style={styles.info}>
          <Text style={styles.name}>{exercise.name}</Text>
          <Text style={styles.meta}>{meta}</Text>
        </View>
        <View style={styles.circles}>
          {circles.map((done, si) => (
            <MaterialIcons
              key={si}
              name={done ? 'check-circle' : 'radio-button-unchecked'}
              size={16}
              color={done ? '#22C55E' : colors.textDim}
            />
          ))}
        </View>
      </Pressable>

      {expanded && isStrength && (
        <View style={styles.form}>
          <View style={styles.gridRow}>
            <Text style={styles.rowLabel}>Weight{'\n'}(kg)</Text>
            {rows.map((row, i) => {
              const editable = isEditable(i);
              return (
                <TextInput
                  key={i}
                  style={[styles.cell, focused === `w${i}` && styles.cellFocused, !editable && styles.cellLocked]}
                  value={row.weight}
                  onChangeText={(v) => editable && updateRow(i, 'weight', v)}
                  onFocus={() => editable && setFocused(`w${i}`)}
                  onBlur={() => { if (editable) formatWeightOnBlur(i); }}
                  keyboardType="decimal-pad"
                  placeholder={editable ? (weightPlaceholders[i] || '—') : ''}
                  placeholderTextColor={weightPlaceholders[i] ? colors.textMuted : colors.textDim}
                  editable={editable}
                  textAlign="center"
                />
              );
            })}
          </View>

          <View style={styles.gridRow}>
            <Text style={styles.rowLabel}>Reps</Text>
            {rows.map((row, i) => {
              const editable = isEditable(i);
              return (
                <TextInput
                  key={i}
                  style={[styles.cell, focused === `r${i}` && styles.cellFocused, !editable && styles.cellLocked]}
                  value={row.reps}
                  onChangeText={(v) => editable && updateRow(i, 'reps', v)}
                  onFocus={() => editable && setFocused(`r${i}`)}
                  onBlur={() => { if (editable) onRepsBlur(); else setFocused(null); }}
                  keyboardType="numeric"
                  placeholder={editable ? (repsSuggestion || '—') : ''}
                  placeholderTextColor={repsSuggestion ? colors.textMuted : colors.textDim}
                  editable={editable}
                  textAlign="center"
                />
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.sm,
    marginVertical: spacing.xs,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  info: { flex: 1 },
  name: { color: colors.text, fontSize: font.md },
  meta: { color: colors.textDim, fontSize: font.sm, marginTop: 1 },
  circles: { flexDirection: 'row', gap: 3 },
  form: {
    paddingLeft: 20 + spacing.sm + spacing.sm,
    paddingRight: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { width: LABEL_W, color: colors.textMuted, fontSize: font.sm, lineHeight: 17 },
  cell: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    color: colors.text,
    fontSize: font.md,
  },
  cellFocused: { borderColor: colors.accent },
  cellLocked: { opacity: 0.3 },
});
