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
  // data=null means "delete the current execution"; returns the saved/existing exec ID
  onSave: (data: Omit<ExerciseExecution, 'id' | 'createdAt'> | null, currentExecId: string | null) => Promise<string | null>;
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

  // Tracks the saved execution ID from both the prop and the onSave return value so
  // the clear path can find the document even before Firestore fires after a save.
  const savedExecIdRef = useRef<string | null>(execution?.id ?? null);
  useEffect(() => {
    if (execution?.id) savedExecIdRef.current = execution.id;
    else if (execution === null) savedExecIdRef.current = null;
  }, [execution]);

  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  const isSaving = useRef(false);
  const pendingSave = useRef<SeriesRow[] | null>(null);

  // Blocks the Firestore sync effect while local unsaved changes exist
  const isEditingRef = useRef(false);
  const isLocallyModifiedRef = useRef(false);

  useEffect(() => {
    if (isEditingRef.current || isLocallyModifiedRef.current) return;
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

  // Collapsing the form drops local-modified state so next expand shows Firestore truth
  useEffect(() => {
    if (!expanded) isLocallyModifiedRef.current = false;
  }, [expanded]);

  const weightPlaceholders: string[] = Array.from({ length: seriesCount }, (_, i) => {
    for (let j = i - 1; j >= 0; j--) {
      if (isValidWeight(rows[j].weight)) return rows[j].weight;
    }
    const src = lastExecution;
    if (!src) return '—';
    if (src.seriesData && src.seriesData.length > 0) {
      const w = src.seriesData[i]?.weight ?? src.seriesData.find((s) => s.weight != null)?.weight;
      return w != null ? w.toFixed(1) : '—';
    }
    return src.weight != null ? src.weight.toFixed(1) : '—';
  });

  const repsSuggestion = exercise.repsMin != null
    ? exercise.repsMax != null && exercise.repsMax !== exercise.repsMin
      ? `${exercise.repsMin} - ${exercise.repsMax}`
      : String(exercise.repsMin)
    : '—';

  function updateRow(i: number, field: keyof SeriesRow, raw: string) {
    isLocallyModifiedRef.current = true;
    const value = field === 'weight' ? filterWeight(raw) : filterReps(raw);
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function isEditable(i: number): boolean {
    if (i === 0) return true;
    return isSeriesDone(rows[i - 1]);
  }

  async function doSave(current: SeriesRow[]) {
    let doneCount = 0;
    for (const row of current) {
      if (isSeriesDone(row)) doneCount++;
      else break;
    }

    if (doneCount === 0) {
      const series0Empty = current[0].weight === '' && current[0].reps === '';
      if (!series0Empty) return; // partial — keep modification flag, block sync

      // All inputs blank: tell parent to delete the execution
      const currentId = savedExecIdRef.current ?? executionRef.current?.id ?? null;
      try {
        await onSaveRef.current(null, currentId);
        savedExecIdRef.current = null;
      } catch (e: unknown) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Could not clear.');
      }
      isLocallyModifiedRef.current = false;
      return;
    }

    try {
      const seriesData: SeriesEntry[] = current.slice(0, doneCount).map((r) => {
        const entry: SeriesEntry = { weightUnit: 'kg' };
        if (isValidWeight(r.weight)) entry.weight = parseFloat(r.weight);
        if (isValidReps(r.reps)) entry.reps = parseInt(r.reps, 10);
        return entry;
      });
      const allDone = doneCount === current.length;
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
      const currentId = savedExecIdRef.current ?? executionRef.current?.id ?? null;
      const returnedId = await onSaveRef.current(data, currentId);
      if (returnedId) savedExecIdRef.current = returnedId;
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save.');
    }
    isLocallyModifiedRef.current = false;
  }

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
    isEditingRef.current = false;
    setFocused(null);
    setRows((prev) => {
      const next = prev.map((r, idx) => {
        if (idx !== i) return r;
        const n = parseFloat(r.weight);
        return { ...r, weight: isNaN(n) ? r.weight : n.toFixed(1) };
      });
      triggerSave(next);
      return next;
    });
  }

  function onRepsBlur() {
    isEditingRef.current = false;
    setFocused(null);
    setRows((prev) => {
      triggerSave(prev);
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
              const showPlaceholder = editable && row.weight === '' && focused !== `w${i}`;
              return (
                <View key={i} style={styles.cellOuter}>
                  <TextInput
                    style={[styles.cell, focused === `w${i}` && styles.cellFocused, circles[i] && styles.cellSaved, !editable && styles.cellLocked]}
                    value={row.weight}
                    onChangeText={(v) => editable && updateRow(i, 'weight', v)}
                    onFocus={() => { if (editable) { isEditingRef.current = true; setFocused(`w${i}`); } }}
                    onBlur={() => { if (editable) formatWeightOnBlur(i); }}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    placeholder=""
                    editable={editable}
                    textAlign="right"
                  />
                  {showPlaceholder && (
                    <View pointerEvents="none" style={styles.cellPlaceholder}>
                      <Text style={styles.cellPlaceholderText}>{weightPlaceholders[i]}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.gridRow}>
            <Text style={styles.rowLabel}>Reps</Text>
            {rows.map((row, i) => {
              const editable = isEditable(i);
              const showPlaceholder = editable && row.reps === '' && focused !== `r${i}`;
              return (
                <View key={i} style={styles.cellOuter}>
                  <TextInput
                    style={[styles.cell, focused === `r${i}` && styles.cellFocused, circles[i] && styles.cellSaved, !editable && styles.cellLocked]}
                    value={row.reps}
                    onChangeText={(v) => editable && updateRow(i, 'reps', v)}
                    onFocus={() => { if (editable) { isEditingRef.current = true; setFocused(`r${i}`); } }}
                    onBlur={() => { if (editable) onRepsBlur(); else setFocused(null); }}
                    keyboardType="numeric"
                    returnKeyType="done"
                    placeholder=""
                    editable={editable}
                    textAlign="right"
                  />
                  {showPlaceholder && (
                    <View pointerEvents="none" style={styles.cellPlaceholder}>
                      <Text style={styles.cellPlaceholderText}>{repsSuggestion}</Text>
                    </View>
                  )}
                </View>
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
  cellOuter: { flex: 1 },
  cell: {
    width: '100%',
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
  cellSaved: { borderColor: '#22C55E' },
  cellLocked: { opacity: 0.3 },
  cellPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellPlaceholderText: {
    color: colors.textMuted,
    fontSize: font.md,
    textAlign: 'center',
  },
});
