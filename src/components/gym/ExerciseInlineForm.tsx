import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Modal as RNModal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing, font, radius } from '../../theme';
import { Collapsible } from '../ui/Collapsible';
import {
  type Exercise, type ExerciseExecution, type SetEntry, exerciseType,
} from '../../types/gym';

interface SetRow { weight: string; reps: string; skipped?: boolean }

const SKIP_COLOR = colors.danger;
const OPTIONAL_SKIP_COLOR = colors.textMuted;
const REPLACE_COLOR = '#3B82F6';
const STATUS_EXTENDED_COLOR = '#00875A';

// Context-menu geometry: fixed card width + close-row height let us position the
// card so its X icon lands exactly on the dots button, regardless of tap position.
const MENU_CARD_WIDTH = 200;
const MENU_CLOSE_HEIGHT = 18;
const MENU_X_OFFSET_FROM_RIGHT = 19; // paddingHorizontal + iconSize/2 of the close row

interface Props {
  exercise: Exercise;
  badge?: string;
  execution: ExerciseExecution | null;
  lastExecution: ExerciseExecution | null;
  routineExecutionId: string;
  dueDate: string;
  // data=null means "delete the current execution"; returns the saved/existing exec ID
  onSave: (data: Omit<ExerciseExecution, 'id' | 'createdAt'> | null, currentExecId: string | null) => Promise<string | null>;
  onUpdateExercise: (data: Partial<Exercise>) => Promise<void>;
  onReplace?: () => void;
  canDelete?: boolean;
  // Reports live timer state up so the parent can show a running-timer badge
  // even while this form is collapsed/hidden (it stays mounted, just not visible).
  onTimerChange?: (running: boolean, elapsedSec: number) => void;
  // Lifted to the parent (keyed by routine execution + exercise) instead of local state,
  // so it survives this component remounting — e.g. when status-based grouping moves the
  // parent routine card into a different group as its status changes.
  expanded: boolean;
  onToggleExpanded: () => void;
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

function isSetDone(row: SetRow): boolean {
  return row.skipped === true || (isValidWeight(row.weight) && isValidReps(row.reps));
}

// Derives current elapsed seconds from wall-clock time rather than trusting an
// incrementing counter, so a running timer stays correct across app backgrounding,
// component remounts (e.g. switching fitness tabs), or missed interval ticks.
function liveElapsedSec(baseSec: number, startedAtISO?: string | null): number {
  if (!startedAtISO) return baseSec;
  const startedMs = new Date(startedAtISO).getTime();
  return baseSec + Math.max(0, Math.round((Date.now() - startedMs) / 1000));
}

function isValidDuration(s: string): boolean {
  return /^\d+(\.\d+)?$/.test(s.trim()) && parseFloat(s) > 0;
}

// Point on a ring at fraction `f` around its circumference, starting at 12 o'clock going clockwise.
function ringTipPoint(cx: number, cy: number, r: number, f: number): { x: number; y: number } {
  const angle = ((-90 + f * 360) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

// Progressively darker greens, one shade per completed overtime lap.
const OVERTIME_SHADES = ['#15803d', '#052e16'];
function lapShade(lapIndex: number): string {
  return OVERTIME_SHADES[Math.min(lapIndex, OVERTIME_SHADES.length - 1)];
}

const LABEL_W = 52;

// Four explicit rows (label / + / value / -) each spanning both minutes and seconds. Every
// cell — label, button, box — sits in a same-width slot (wider than the small value box
// itself, so "Minutes"/"Seconds" fit) with a fixed-width colon slot shared by every row.
// That's what keeps the ":" exactly centered on the value-box row, and every row's items
// stacked in the same two columns, regardless of the label text being wider than the box.
function HmsEditor({ minutes, seconds, onIncrementMinutes, onDecrementMinutes, onIncrementSeconds, onDecrementSeconds }: {
  minutes: number; seconds: number;
  onIncrementMinutes: () => void; onDecrementMinutes: () => void;
  onIncrementSeconds: () => void; onDecrementSeconds: () => void;
}) {
  return (
    <View>
      <View style={styles.hmsRow}>
        <View style={styles.hmsSlot}><Text style={styles.hmsLabel}>Minutes</Text></View>
        <View style={styles.hmsColonSlot} />
        <View style={styles.hmsSlot}><Text style={styles.hmsLabel}>Seconds</Text></View>
      </View>
      <View style={styles.hmsRow}>
        <View style={styles.hmsSlot}>
          <Pressable onPress={onIncrementMinutes} style={styles.hmsStepBtn}>
            <Text style={styles.hmsStepBtnText}>+</Text>
          </Pressable>
        </View>
        <View style={styles.hmsColonSlot} />
        <View style={styles.hmsSlot}>
          <Pressable onPress={onIncrementSeconds} style={styles.hmsStepBtn}>
            <Text style={styles.hmsStepBtnText}>+</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.hmsRow}>
        <View style={styles.hmsSlot}>
          <View style={styles.hmsBox}>
            <Text style={styles.hmsValue}>{minutes.toString().padStart(2, '0')}</Text>
          </View>
        </View>
        <View style={styles.hmsColonSlot}>
          <Text style={styles.hmsColon}>:</Text>
        </View>
        <View style={styles.hmsSlot}>
          <View style={styles.hmsBox}>
            <Text style={styles.hmsValue}>{seconds.toString().padStart(2, '0')}</Text>
          </View>
        </View>
      </View>
      <View style={styles.hmsRow}>
        <View style={styles.hmsSlot}>
          <Pressable onPress={onDecrementMinutes} disabled={minutes <= 0} style={[styles.hmsStepBtn, minutes <= 0 && styles.cellLocked]}>
            <Text style={styles.hmsStepBtnText}>−</Text>
          </Pressable>
        </View>
        <View style={styles.hmsColonSlot} />
        <View style={styles.hmsSlot}>
          <Pressable onPress={onDecrementSeconds} disabled={seconds <= 0} style={[styles.hmsStepBtn, seconds <= 0 && styles.cellLocked]}>
            <Text style={styles.hmsStepBtnText}>−</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function ExerciseInlineForm({ exercise, badge, execution, lastExecution, routineExecutionId, dueDate, onSave, onUpdateExercise, onReplace, canDelete = true, onTimerChange, expanded, onToggleExpanded }: Props) {
  const isStrength = exerciseType(exercise) === 'strength';
  // `canDelete` doubles as "this exercise is optional" (only optional exercises can be
  // deleted) — skipping optional exercises works the same but is shown in grey, not red.
  const skipColor = canDelete ? OPTIONAL_SKIP_COLOR : SKIP_COLOR;
  const setCount = exercise.sets ?? 3;
  const [rows, setRows] = useState<SetRow[]>(() =>
    Array.from({ length: setCount }, () => ({ weight: '', reps: '' })),
  );
  const [focused, setFocused] = useState<string | null>(null);

  const onUpdateExerciseRef = useRef(onUpdateExercise);
  useEffect(() => { onUpdateExerciseRef.current = onUpdateExercise; }, [onUpdateExercise]);

  const [elapsedSec, setElapsedSec] = useState(() =>
    liveElapsedSec(execution?.durationMin != null ? Math.round(execution.durationMin * 60) : 0, execution?.timerStartedAt),
  );
  const elapsedSecRef = useRef(elapsedSec);
  const [paramStrs, setParamStrs] = useState<string[]>(() =>
    exercise.params.map((p) => execution?.paramValues.find((pv) => pv.paramId === p.id)?.value ?? ''),
  );
  const paramStrsRef = useRef<string[]>(paramStrs);
  const pendingCardioSave = useRef(false);

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
  const pendingSave = useRef<SetRow[] | null>(null);

  const [timerRunning, setTimerRunning] = useState(() => Boolean(execution?.timerStartedAt));
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Baseline seconds accumulated before the current run started; fixed while running
  // (elapsedSecRef grows via wall-clock ticks off of it, not by mutating this ref).
  const runBaseSecRef = useRef(
    execution?.durationMin != null ? Math.round(execution.durationMin * 60) : 0,
  );
  const timerStartedAtRef = useRef<string | null>(execution?.timerStartedAt ?? null);
  const targetMin = exercise.durationMin ?? 10;

  function stopTicking() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }

  function ensureTicking() {
    if (timerIntervalRef.current) return;
    timerIntervalRef.current = setInterval(() => {
      const secs = liveElapsedSec(runBaseSecRef.current, timerStartedAtRef.current);
      setElapsedSec(secs);
      elapsedSecRef.current = secs;
    }, 1000);
  }

  const onTimerChangeRef = useRef(onTimerChange);
  useEffect(() => { onTimerChangeRef.current = onTimerChange; }, [onTimerChange]);
  useEffect(() => {
    onTimerChangeRef.current?.(timerRunning, elapsedSec);
  }, [timerRunning, elapsedSec]);

  const [durationStr, setDurationStr] = useState(String(targetMin));
  useEffect(() => {
    if (isEditingRef.current) return;
    setDurationStr(String(exercise.durationMin ?? 10));
  }, [exercise.durationMin]);

  const [editingTime, setEditingTime] = useState<'mm' | 'ss' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  const moreBtnRef = useRef<View>(null);

  useEffect(() => () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); }, []);

  // Blocks the Firestore sync effect while local unsaved changes exist
  const isEditingRef = useRef(false);
  const isLocallyModifiedRef = useRef(false);

  useEffect(() => {
    if (isEditingRef.current || isLocallyModifiedRef.current) return;
    const count = exercise.sets ?? 3;
    const fmt = (w: number | undefined) => w != null ? w.toFixed(1) : '';
    if (execution?.setData && execution?.setData.length > 0) {
      setRows(Array.from({ length: count }, (_, i) => {
        const s = execution?.setData![i];
        if (s?.skipped) return { weight: '0', reps: '0', skipped: true };
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
    if (!isStrength) {
      const base = execution?.durationMin != null ? Math.round(execution.durationMin * 60) : 0;
      const startedAt = execution?.timerStartedAt ?? null;
      runBaseSecRef.current = base;
      timerStartedAtRef.current = startedAt;
      const secs = liveElapsedSec(base, startedAt);
      setElapsedSec(secs);
      elapsedSecRef.current = secs;
      setTimerRunning(Boolean(startedAt));
      if (startedAt) ensureTicking(); else stopTicking();
      const pStrs = exercise.params.map((p) =>
        execution?.paramValues.find((pv) => pv.paramId === p.id)?.value ?? '',
      );
      setParamStrs(pStrs);
      paramStrsRef.current = pStrs;
    }
  }, [execution, exercise.sets, exercise.params, isStrength]);

  // Collapsing the form drops local-modified state so next expand shows Firestore truth
  useEffect(() => {
    if (!expanded) isLocallyModifiedRef.current = false;
  }, [expanded]);

  const weightPlaceholders: string[] = Array.from({ length: setCount }, (_, i) => {
    for (let j = i - 1; j >= 0; j--) {
      if (isValidWeight(rows[j].weight)) return rows[j].weight;
    }
    const src = lastExecution;
    if (!src) return '—';
    if (src.setData && src.setData.length > 0) {
      // The last non-skipped, non-zero set actually logged last time — not just
      // whichever set shares this same index, which could be blank or skipped.
      const lastValid = [...src.setData].reverse()
        .find((s) => !s.skipped && s.weight != null && s.weight > 0);
      return lastValid?.weight != null ? lastValid.weight.toFixed(1) : '—';
    }
    return src.weight != null && src.weight > 0 ? src.weight.toFixed(1) : '—';
  });

  const repsSuggestion = exercise.repsMin != null
    ? exercise.repsMax != null && exercise.repsMax !== exercise.repsMin
      ? `${exercise.repsMin} - ${exercise.repsMax}`
      : String(exercise.repsMin)
    : '—';

  function updateRow(i: number, field: keyof SetRow, raw: string) {
    isLocallyModifiedRef.current = true;
    const value = field === 'weight' ? filterWeight(raw) : filterReps(raw);
    setRows((prev) => prev.map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, [field]: value };
      const isZeroZero = next.weight.trim() === '0' && next.reps.trim() === '0';
      return { ...next, skipped: isZeroZero };
    }));
  }

  function isEditable(i: number): boolean {
    if (i === 0) return true;
    return isSetDone(rows[i - 1]);
  }

  function toggleSkipRow(i: number) {
    isLocallyModifiedRef.current = true;
    setRows((prev) => {
      const turningOn = !prev[i].skipped;
      // Skipping cascades forward to every following set of this exercise.
      // Unskipping clears every skipped set in the exercise, not just this one onward —
      // otherwise an earlier skipped set can get "stuck" and block later ones from unskipping.
      const next = turningOn
        ? prev.map((r, idx) => idx < i ? r : { weight: '0.0', reps: '0', skipped: true })
        : prev.map((r) => r.skipped ? { weight: '', reps: '' } : r);
      triggerSave(next);
      return next;
    });
  }

  function toggleSkipExercise() {
    if (isStrength) {
      const allSkipped = rows.length > 0 && rows.every((r) => r.skipped);
      if (allSkipped) {
        const next = rows.map(() => ({ weight: '', reps: '' }));
        isLocallyModifiedRef.current = true;
        setRows(next);
        triggerSave(next);
        return;
      }
      const hasRealSet = rows.some((r) => !r.skipped && isValidWeight(r.weight) && isValidReps(r.reps));
      if (hasRealSet) {
        Alert.alert('Cannot skip', 'This exercise already has at least one completed set.');
        return;
      }
      const next = rows.map(() => ({ weight: '0', reps: '0', skipped: true }));
      isLocallyModifiedRef.current = true;
      setRows(next);
      triggerSave(next);
      return;
    }

    // Cardio has no per-set concept — skip the whole exercise via a flag instead.
    const alreadySkipped = executionRef.current?.skipped ?? false;
    if (!alreadySkipped && elapsedSecRef.current > 0) {
      Alert.alert('Cannot skip', 'This exercise already has logged time.');
      return;
    }
    void (async () => {
      const data: Omit<ExerciseExecution, 'id' | 'createdAt'> = {
        exerciseId: exercise.id,
        date: dueDate,
        paramValues: executionRef.current?.paramValues ?? [],
        completed: false,
        skipped: !alreadySkipped,
        routineExecutionId,
        ...(executionRef.current?.durationMin != null ? { durationMin: executionRef.current.durationMin } : {}),
      };
      const currentId = savedExecIdRef.current ?? executionRef.current?.id ?? null;
      try {
        const returnedId = await onSaveRef.current(data, currentId);
        if (returnedId) savedExecIdRef.current = returnedId;
      } catch (e: unknown) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Could not update.');
      }
    })();
  }

  function confirmDeleteExercise() {
    Alert.alert('Delete logged data?', `This will clear everything logged for ${exercise.name} on this occurrence.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const currentId = savedExecIdRef.current ?? executionRef.current?.id ?? null;
        if (!currentId) return;
        try {
          await onSaveRef.current(null, currentId);
          savedExecIdRef.current = null;
        } catch (e: unknown) {
          Alert.alert('Error', e instanceof Error ? e.message : 'Could not delete.');
        }
      } },
    ]);
  }

  function confirmResetExercise() {
    Alert.alert('Reset exercise?', `Clear everything logged for ${exercise.name} on this occurrence.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => {
        isLocallyModifiedRef.current = true;
        if (isStrength) {
          const next = rows.map(() => ({ weight: '', reps: '' }));
          setRows(next);
          triggerSave(next);
        } else {
          setElapsedSec(0);
          elapsedSecRef.current = 0;
          const nextParams = exercise.params.map(() => '');
          setParamStrs(nextParams);
          paramStrsRef.current = nextParams;
          triggerSaveCardio();
        }
      } },
    ]);
  }

  async function doSave(current: SetRow[]) {
    let doneCount = 0;
    for (const row of current) {
      if (isSetDone(row)) doneCount++;
      else break;
    }
    // Separate from doneCount: also persist a trailing partially-filled row (e.g. weight
    // typed but reps not yet entered) so other views (routine progress bar) can see it
    // as "in progress" instead of it vanishing until the row is fully completed.
    let saveCount = 0;
    for (const row of current) {
      if (row.skipped || isValidWeight(row.weight) || isValidReps(row.reps)) saveCount++;
      else break;
    }

    if (saveCount === 0) {
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
      const setData: SetEntry[] = current.slice(0, saveCount).map((r) => {
        if (r.skipped) return { skipped: true };
        const entry: SetEntry = { weightUnit: 'kg' };
        if (isValidWeight(r.weight)) entry.weight = parseFloat(r.weight);
        if (isValidReps(r.reps)) entry.reps = parseInt(r.reps, 10);
        return entry;
      });
      const anySkipped = current.slice(0, saveCount).some((r) => r.skipped);
      const allDone = doneCount === current.length && !anySkipped;
      const data: Omit<ExerciseExecution, 'id' | 'createdAt'> = {
        exerciseId: exercise.id,
        date: dueDate,
        paramValues: executionRef.current?.paramValues ?? [],
        completed: isStrength ? allDone : true,
        skipped: false,
        routineExecutionId,
        setData,
        sets: setCount,
        ...(setData[0]?.reps != null ? { reps: setData[0].reps } : {}),
        ...(setData[0]?.weight != null ? { weight: setData[0].weight, weightUnit: 'kg' as const } : {}),
      };
      const currentId = savedExecIdRef.current ?? executionRef.current?.id ?? null;
      const returnedId = await onSaveRef.current(data, currentId);
      if (returnedId) savedExecIdRef.current = returnedId;
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save.');
    }
    isLocallyModifiedRef.current = false;
  }

  async function triggerSave(current: SetRow[]) {
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

  async function doSaveCardio() {
    const durationComplete = elapsedSecRef.current >= targetMin * 60;
    // Not "empty" while a timer is actively running — otherwise pressing start on a
    // fresh exercise (elapsed still 0 at that instant) would delete the execution.
    const everythingEmpty = elapsedSecRef.current === 0 && timerStartedAtRef.current === null
      && paramStrsRef.current.every((s) => s === '');

    if (everythingEmpty) {
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
      const data: Omit<ExerciseExecution, 'id' | 'createdAt'> = {
        exerciseId: exercise.id,
        date: dueDate,
        paramValues: exercise.params
          .map((p, i) => ({ paramId: p.id, value: paramStrsRef.current[i] }))
          .filter((pv) => pv.value !== ''),
        completed: durationComplete,
        skipped: false,
        routineExecutionId,
        // Always write durationMin explicitly (even 0) — omitting it on reset would
        // leave Firestore holding the stale prior value, which then jumps back into
        // the local state the next time this doc's snapshot echoes back.
        durationMin: Math.round((elapsedSecRef.current / 60) * 100) / 100,
        // Persisted so the timer survives navigation/backgrounding/remounts — elapsed
        // is always re-derived as durationMin + (now - timerStartedAt), not from a
        // JS interval that can be paused or lost. null explicitly clears it on stop.
        timerStartedAt: timerStartedAtRef.current,
      };
      const currentId = savedExecIdRef.current ?? executionRef.current?.id ?? null;
      const returnedId = await onSaveRef.current(data, currentId);
      if (returnedId) savedExecIdRef.current = returnedId;
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save.');
    }
    isLocallyModifiedRef.current = false;
  }

  function startTimer() {
    if (timerRunning) return;
    timerStartedAtRef.current = new Date().toISOString();
    setTimerRunning(true);
    ensureTicking();
    isLocallyModifiedRef.current = true;
    triggerSaveCardio();
  }

  function stopTimer() {
    if (!timerRunning) return;
    const finalSecs = liveElapsedSec(runBaseSecRef.current, timerStartedAtRef.current);
    stopTicking();
    setTimerRunning(false);
    timerStartedAtRef.current = null;
    runBaseSecRef.current = finalSecs;
    setElapsedSec(finalSecs);
    elapsedSecRef.current = finalSecs;
    isLocallyModifiedRef.current = true;
    triggerSaveCardio();
  }

  function doResetTimer() {
    stopTicking();
    setTimerRunning(false);
    timerStartedAtRef.current = null;
    runBaseSecRef.current = 0;
    setElapsedSec(0);
    elapsedSecRef.current = 0;
    isLocallyModifiedRef.current = true;
    triggerSaveCardio();
  }

  function confirmResetTimer() {
    Alert.alert('Reset timer?', 'This will clear the elapsed time for this exercise.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: doResetTimer },
    ]);
  }

  function pad2(n: number): string {
    return n.toString().padStart(2, '0');
  }

  function startEditMinutes() {
    isEditingRef.current = true;
    setEditingTime('mm');
  }

  function startEditSeconds() {
    isEditingRef.current = true;
    setEditingTime('ss');
  }

  function closeTimeEditor() {
    isEditingRef.current = false;
    setEditingTime(null);
  }

  function applyDialValue(next: number) {
    // The edited value becomes the new baseline; if still running, restart the
    // wall-clock reference from now so future ticks continue from this value.
    runBaseSecRef.current = next;
    if (timerRunning) timerStartedAtRef.current = new Date().toISOString();
    setElapsedSec(next);
    elapsedSecRef.current = next;
    isLocallyModifiedRef.current = true;
    triggerSaveCardio();
  }

  // Each stepper just adds/subtracts its own unit directly to the total elapsed seconds;
  // minutes/seconds for display are always re-derived from that afterward, matching the
  // main timer's own display (which isn't capped at 59 minutes either).
  function adjustMinutes(delta: number) {
    applyDialValue(Math.max(0, elapsedSecRef.current + delta * 60));
  }

  function adjustSeconds(delta: number) {
    applyDialValue(Math.max(0, elapsedSecRef.current + delta));
  }

  function adjustDuration(delta: number) {
    const current = parseFloat(durationStr) || targetMin;
    const next = Math.max(1, Math.round(current + delta));
    setDurationStr(String(next));
    onUpdateExerciseRef.current({ durationMin: next }).catch(() => {
      Alert.alert('Error', 'Could not save duration.');
    });
  }

  function onDurationBlur() {
    isEditingRef.current = false;
    setFocused(null);
    const n = parseFloat(durationStr);
    if (isValidDuration(durationStr)) {
      const rounded = Math.round(n);
      setDurationStr(String(rounded));
      onUpdateExerciseRef.current({ durationMin: rounded }).catch(() => {
        Alert.alert('Error', 'Could not save duration.');
      });
    } else {
      setDurationStr(String(targetMin));
    }
  }

  function adjustParam(i: number, delta: number) {
    const current = parseFloat(paramStrs[i]);
    const base = isNaN(current) ? 0 : current;
    const next = Math.max(0, base + delta);
    const nextStr = Number.isInteger(next) ? String(next) : next.toFixed(1);
    isLocallyModifiedRef.current = true;
    const nextArr = [...paramStrs];
    nextArr[i] = nextStr;
    setParamStrs(nextArr);
    paramStrsRef.current = nextArr;
    triggerSaveCardio();
  }

  async function triggerSaveCardio() {
    if (isSaving.current) {
      pendingCardioSave.current = true;
      return;
    }
    isSaving.current = true;
    try {
      await doSaveCardio();
    } finally {
      isSaving.current = false;
      if (pendingCardioSave.current) {
        pendingCardioSave.current = false;
        triggerSaveCardio();
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

  const circles: boolean[] = rows.map(isSetDone);
  // Completed requires the timer to be stopped (a running-but-over-target timer is
  // still "in progress", not completed).
  const cardioIsDone = !isStrength && !timerRunning && (elapsedSec >= targetMin * 60 || (execution?.completed ?? false));
  const isCardioSkipped = !isStrength && (execution?.skipped ?? false);
  const allSetsSkipped = isStrength && rows.length > 0 && rows.every((r) => r.skipped);

  // Title color: red if any set is skipped, green if fully complete, yellow if in progress.
  const anySkippedSet = isStrength ? rows.some((r) => r.skipped) : isCardioSkipped;
  const allSetsDone = isStrength
    ? rows.length > 0 && rows.every((r) => r.skipped || (isValidWeight(r.weight) && isValidReps(r.reps)))
    : cardioIsDone;
  const isYellow = anySkippedSet
    ? false
    : isStrength
      // In progress: the first set's weight value is filled, but not yet all done.
      ? !allSetsDone && isValidWeight(rows[0]?.weight ?? '')
      : (timerRunning || elapsedSec > 0) && !cardioIsDone;
  // Optional exercises get a distinct dark-green treatment once every set is addressed
  // (done or skipped) and at least one was actually completed — a set still genuinely
  // in progress or untouched must keep showing yellow, not jump to dark green early.
  const anySetCompleted = isStrength
    ? rows.some((r) => !r.skipped && isValidWeight(r.weight) && isValidReps(r.reps))
    : cardioIsDone;
  const isOptionalDone = canDelete && allSetsDone && anySetCompleted;
  const nameColor = isOptionalDone
    ? STATUS_EXTENDED_COLOR
    : anySkippedSet
      ? skipColor
      : isYellow
        ? '#EAB308'
        : allSetsDone
          ? '#22C55E'
          : colors.text;
  const skipMenuLabel = isStrength
    ? (allSetsSkipped ? 'Unskip' : 'Skip')
    : (isCardioSkipped ? 'Unskip' : 'Skip');

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={onToggleExpanded}>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={20}
          color={colors.textMuted}
        />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            {badge && (
              <View style={styles.exBadge}>
                <Text style={styles.exBadgeText}>{badge}</Text>
              </View>
            )}
            {!isStrength && timerRunning && (() => {
              const targetSec = Math.round(targetMin * 60);
              if (elapsedSec >= targetSec) {
                const overSec = elapsedSec - targetSec;
                return (
                  <>
                    <View style={[styles.exBadge, { backgroundColor: '#22C55E22', borderWidth: 0 }]}>
                      <Text style={[styles.exBadgeText, { color: '#22C55E' }]}>
                        {pad2(Math.floor(targetSec / 60))}:{pad2(targetSec % 60)}
                      </Text>
                    </View>
                    <View style={[styles.exBadge, { backgroundColor: '#EAB30822', borderWidth: 0 }]}>
                      <Text style={[styles.exBadgeText, { color: '#EAB308' }]}>
                        + {pad2(Math.floor(overSec / 60))}:{pad2(overSec % 60)}
                      </Text>
                    </View>
                  </>
                );
              }
              return (
                <View style={[styles.exBadge, { backgroundColor: '#EAB30822', borderWidth: 0 }]}>
                  <Text style={[styles.exBadgeText, { color: '#EAB308' }]}>
                    {pad2(Math.floor(elapsedSec / 60))}:{pad2(elapsedSec % 60)}
                  </Text>
                </View>
              );
            })()}
            <Text style={[styles.name, { color: nameColor }]} numberOfLines={1}>{exercise.name}</Text>
          </View>
        </View>
        <View style={styles.circles}>
          {isCardioSkipped ? (
            <MaterialIcons name="cancel" size={16} color={skipColor} />
          ) : isStrength ? (
            circles.map((done, si) => (
              rows[si]?.skipped ? (
                <MaterialIcons key={si} name="cancel" size={16} color={skipColor} />
              ) : (
                <MaterialIcons key={si} name={done ? 'check-circle' : 'radio-button-unchecked'} size={16} color={done ? (isOptionalDone ? STATUS_EXTENDED_COLOR : '#22C55E') : (isYellow ? '#EAB308' : colors.textDim)} />
              )
            ))
          ) : (
            <MaterialIcons name={cardioIsDone ? 'check-circle' : 'radio-button-unchecked'} size={16} color={cardioIsDone ? (isOptionalDone ? STATUS_EXTENDED_COLOR : '#22C55E') : (isYellow ? '#EAB308' : colors.textDim)} />
          )}
        </View>
        <Pressable
          ref={moreBtnRef}
          onPress={(e) => {
            e.stopPropagation();
            moreBtnRef.current?.measureInWindow((x, y, width, height) => {
              setMenuAnchor({ x: x + width / 2, y: y + height / 2 });
              setMenuOpen(true);
            });
          }}
          hitSlop={8}
          style={styles.moreBtn}
        >
          <MaterialIcons name="more-vert" size={18} color={colors.textMuted} />
        </Pressable>
      </Pressable>

      <RNModal visible={menuOpen} transparent animationType="none" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.exMenuBackdrop} onPress={() => setMenuOpen(false)}>
          {/* Position card so the close row's X icon centre sits exactly where the dots icon was, regardless of tap position. */}
          <Pressable
            style={[
              styles.exMenuCard,
              { top: menuAnchor.y - MENU_CLOSE_HEIGHT / 2, left: menuAnchor.x - MENU_CARD_WIDTH + MENU_X_OFFSET_FROM_RIGHT },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Pressable style={styles.exMenuCloseRow} onPress={() => setMenuOpen(false)}>
              <MaterialIcons name="close" size={14} color={colors.textMuted} />
            </Pressable>
            <Pressable style={styles.exMenuItem} onPress={() => { setMenuOpen(false); toggleSkipExercise(); }}>
              <MaterialIcons name="block" size={18} color={skipColor} />
              <Text style={[styles.exMenuItemText, { color: skipColor }]}>{skipMenuLabel}</Text>
            </Pressable>
            {onReplace && (
              <Pressable style={styles.exMenuItem} onPress={() => { setMenuOpen(false); onReplace(); }}>
                <MaterialIcons name="swap-horiz" size={18} color={REPLACE_COLOR} />
                <Text style={[styles.exMenuItemText, { color: REPLACE_COLOR }]}>Replace</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.exMenuItem, !canDelete && { borderBottomWidth: 0 }]}
              onPress={() => { setMenuOpen(false); confirmResetExercise(); }}
            >
              <MaterialIcons name="refresh" size={18} color={colors.text} />
              <Text style={styles.exMenuItemText}>Reset</Text>
            </Pressable>
            {canDelete && (
              <Pressable style={[styles.exMenuItem, { borderBottomWidth: 0 }]} onPress={() => { setMenuOpen(false); confirmDeleteExercise(); }}>
                <MaterialIcons name="delete" size={18} color={colors.danger} />
                <Text style={[styles.exMenuItemText, { color: colors.danger }]}>Delete</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </RNModal>

      {!isStrength && (
      <Collapsible expanded={expanded}>
      {(() => {
        const rawProgress = targetMin > 0 ? elapsedSec / (targetMin * 60) : 0;
        const isOvertime = rawProgress >= 1;
        // Base green ring fills 0->1 and then stays full; never resets.
        const basePct = Math.min(rawProgress, 1);
        // Every full extra lap darkens one shade; the current (still-running) lap
        // is drawn one shade darker still, on top of the last fully-completed lap.
        const overtimeTotal = isOvertime ? rawProgress - 1 : 0;
        const completedLaps = Math.floor(overtimeTotal);
        const overtimePct = overtimeTotal - completedLaps;
        const lastLapColor = completedLaps > 0 ? lapShade(completedLaps - 1) : null;
        const currentLapColor = lapShade(completedLaps);
        // Yellow ring shows remaining time: full at start, empty once duration elapses, then stays empty.
        const remainingPct = 1 - basePct;
        const mm = Math.floor(elapsedSec / 60);
        const ss = elapsedSec % 60;
        const circumference = 2 * Math.PI * OUTER_R;
        const baseDashOffset = circumference * (1 - basePct);
        const overtimeDashOffset = circumference * (1 - overtimePct);
        const innerCircumference = 2 * Math.PI * INNER_R;
        const innerDashOffset = innerCircumference * (1 - remainingPct);
        const cx = RING_SIZE / 2;
        const cy = RING_SIZE / 2;
        const baseTip = basePct > 0 && basePct < 1 ? ringTipPoint(cx, cy, OUTER_R, basePct) : null;
        const overtimeTip = overtimePct > 0 && overtimePct < 1 ? ringTipPoint(cx, cy, OUTER_R, overtimePct) : null;
        const innerTip = remainingPct > 0 && remainingPct < 1 ? ringTipPoint(cx, cy, INNER_R, remainingPct) : null;
        const markers = [0, 0.25, 0.5, 0.75].map((f) => ringTipPoint(cx, cy, OUTER_R, f));

        // The ring + digits/controls inside it — identical in both layouts, just
        // positioned differently relative to the duration/param boxes around it.
        const ringElement = (
          <View style={styles.timerRingContainer}>
            <View style={styles.timerRingShadow} />
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Circle cx={cx} cy={cy} r={OUTER_R} stroke={colors.border} strokeWidth={OUTER_STROKE} fill="none" />
              <Circle
                cx={cx} cy={cy} r={OUTER_R}
                stroke="#22C55E" strokeWidth={OUTER_STROKE} strokeLinecap="butt"
                strokeDasharray={circumference} strokeDashoffset={baseDashOffset}
                fill="none" rotation={-90} origin={`${cx}, ${cy}`}
              />
              {baseTip && <Circle cx={baseTip.x} cy={baseTip.y} r={OUTER_STROKE / 2} fill="#22C55E" />}
              {lastLapColor && (
                <Circle cx={cx} cy={cy} r={OUTER_R} stroke={lastLapColor} strokeWidth={OUTER_STROKE} fill="none" />
              )}
              {isOvertime && (
                <Circle
                  cx={cx} cy={cy} r={OUTER_R}
                  stroke={currentLapColor} strokeWidth={OUTER_STROKE} strokeLinecap="butt"
                  strokeDasharray={circumference} strokeDashoffset={overtimeDashOffset}
                  fill="none" rotation={-90} origin={`${cx}, ${cy}`}
                />
              )}
              {overtimeTip && <Circle cx={overtimeTip.x} cy={overtimeTip.y} r={OUTER_STROKE / 2} fill={currentLapColor} />}
              <Circle cx={cx} cy={cy} r={INNER_R} stroke={colors.border} strokeWidth={INNER_STROKE} fill="none" />
              <Circle
                cx={cx} cy={cy} r={INNER_R}
                stroke={timerRunning ? '#EAB308' : colors.textDim} strokeWidth={INNER_STROKE} strokeLinecap="butt"
                strokeDasharray={innerCircumference} strokeDashoffset={innerDashOffset}
                fill="none" rotation={-90} origin={`${cx}, ${cy}`}
              />
              {innerTip && <Circle cx={innerTip.x} cy={innerTip.y} r={INNER_STROKE / 2} fill={timerRunning ? '#EAB308' : colors.textDim} />}
              {markers.map((m, i) => (
                <Circle key={i} cx={m.x} cy={m.y} r={2.5} fill={colors.surface2} stroke={colors.textMuted} strokeWidth={1} />
              ))}
            </Svg>
            <View style={styles.timerInner}>
              <View style={styles.digitRow}>
                <Pressable onPress={startEditMinutes} style={styles.digitBox}>
                  <Text style={styles.digitText}>{pad2(mm)}</Text>
                </Pressable>
                <View style={styles.digitColonSlot}>
                  <Text style={styles.digitColon}>:</Text>
                </View>
                <Pressable onPress={startEditSeconds} style={styles.digitBox}>
                  <Text style={styles.digitText}>{pad2(ss)}</Text>
                </Pressable>
              </View>
              <View style={styles.timerControls}>
                <Pressable onPress={timerRunning ? stopTimer : startTimer} style={styles.timerCtrlBtn}>
                  <MaterialIcons name={timerRunning ? 'pause' : 'play-arrow'} size={18} color={colors.text} />
                </Pressable>
                <View style={styles.digitColonSlot} />
                <Pressable onPress={confirmResetTimer} style={styles.timerCtrlBtn}>
                  <MaterialIcons name="replay" size={16} color={colors.text} />
                </Pressable>
              </View>
            </View>
          </View>
        );

        const durationBox = (
          <View style={styles.vParamBox}>
            <Text style={styles.paramLabel} numberOfLines={1}>Duration (min)</Text>
            <Pressable onPress={() => adjustDuration(1)} style={styles.stepBtn}>
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
            <View style={[styles.cellOuter, styles.valueCell, focused === 'duration' && styles.cellFocused]}>
              <TextInput
                style={styles.cell}
                value={durationStr}
                onChangeText={setDurationStr}
                onFocus={() => { isEditingRef.current = true; setFocused('duration'); }}
                onBlur={onDurationBlur}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </View>
            <Pressable onPress={() => adjustDuration(-1)} style={styles.stepBtn}>
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
          </View>
        );

        function paramLabelText(param: Exercise['params'][number]): string {
          return param.unit ? `${param.name} (${param.unit})` : param.name;
        }

        function paramPlaceholder(param: Exercise['params'][number]): string {
          return lastExecution?.paramValues?.find((pv) => pv.paramId === param.id)?.value ?? '—';
        }

        function paramValueField(param: Exercise['params'][number], i: number) {
          return (
            <View style={[styles.cellOuter, styles.valueCell, focused === `p${i}` && styles.cellFocused]}>
              <TextInput
                style={styles.cell}
                value={paramStrs[i]}
                onChangeText={(v) => {
                  isLocallyModifiedRef.current = true;
                  const next = [...paramStrs];
                  next[i] = v;
                  setParamStrs(next);
                  paramStrsRef.current = next;
                }}
                onFocus={() => { isEditingRef.current = true; setFocused(`p${i}`); }}
                onBlur={() => { isEditingRef.current = false; setFocused(null); triggerSaveCardio(); }}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder=""
                editable
              />
              {paramStrs[i] === '' && focused !== `p${i}` && (
                <View pointerEvents="none" style={styles.cellPlaceholder}>
                  <Text style={styles.cellPlaceholderText}>{paramPlaceholder(param)}</Text>
                </View>
              )}
            </View>
          );
        }

        // First extra parameter sits beside the ring, stacked vertically like duration.
        function paramBoxVertical(param: Exercise['params'][number], i: number) {
          return (
            <View key={param.id} style={styles.vParamBox}>
              <Text style={styles.paramLabel} numberOfLines={1}>{paramLabelText(param)}</Text>
              <Pressable onPress={() => adjustParam(i, 1)} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
              {paramValueField(param, i)}
              <Pressable onPress={() => adjustParam(i, -1)} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
            </View>
          );
        }

        return (
        <View style={styles.cardioForm}>
          <View style={styles.centeredWrap}>
            <View style={styles.centeredMainRow}>
              {durationBox}
              {ringElement}
              {exercise.params[0] && paramBoxVertical(exercise.params[0], 0)}
            </View>
            {exercise.params.length > 1 && (
              <View style={styles.centeredParamsWrap}>
                {exercise.params.slice(1).map((param, idx) => paramBoxVertical(param, idx + 1))}
              </View>
            )}
          </View>
        </View>
        );
      })()}
      </Collapsible>
      )}

      <RNModal visible={editingTime !== null} transparent animationType="fade" onRequestClose={closeTimeEditor}>
        <Pressable style={styles.clockBackdrop} onPress={closeTimeEditor}>
          <Pressable style={styles.clockSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.clockTitle}>Edit Time</Text>
            {/* Matches the main timer's own MM:SS display — minutes aren't capped at 59. */}
            <HmsEditor
              minutes={Math.floor(elapsedSec / 60)}
              seconds={elapsedSec % 60}
              onIncrementMinutes={() => adjustMinutes(1)}
              onDecrementMinutes={() => adjustMinutes(-1)}
              onIncrementSeconds={() => adjustSeconds(1)}
              onDecrementSeconds={() => adjustSeconds(-1)}
            />
            <Pressable onPress={closeTimeEditor} style={styles.clockDoneBtn}>
              <Text style={styles.clockDoneText}>Save</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </RNModal>

      {isStrength && (
        <Collapsible expanded={expanded}>
        <View style={styles.form}>
          <View style={styles.setGridHeader}>
            <Text style={styles.setLabelHeader} />
            <Text style={styles.setColHeader}>Weight (kg)</Text>
            <Text style={styles.setColHeader}>Reps</Text>
            <Text style={styles.setColHeaderNarrow}>Skip</Text>
          </View>
          {rows.map((row, i) => {
            const editable = isEditable(i);
            const hasRealData = isValidWeight(row.weight) && isValidReps(row.reps);
            const skipDisabled = !editable || (!row.skipped && hasRealData);
            return (
              <View key={i} style={styles.setGridRow}>
                <Text style={styles.rowLabel}>Set {i + 1}</Text>
                <View style={[
                  styles.cellOuter, focused === `w${i}` && styles.cellFocused,
                  circles[i] && styles.cellSaved, row.skipped && [styles.cellSkipped, { borderColor: skipColor }], !editable && styles.cellLocked,
                ]}>
                  <TextInput
                    style={styles.cell}
                    value={row.weight}
                    onChangeText={(v) => editable && updateRow(i, 'weight', v)}
                    onFocus={() => { if (editable) { isEditingRef.current = true; setFocused(`w${i}`); } }}
                    onBlur={() => { if (editable) formatWeightOnBlur(i); }}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    placeholder=""
                    editable={editable}
                  />
                  {editable && !row.skipped && row.weight === '' && focused !== `w${i}` && (
                    <View pointerEvents="none" style={styles.cellPlaceholder}>
                      <Text style={styles.cellPlaceholderText}>{weightPlaceholders[i]}</Text>
                    </View>
                  )}
                </View>
                <View style={[
                  styles.cellOuter, focused === `r${i}` && styles.cellFocused,
                  circles[i] && styles.cellSaved, row.skipped && [styles.cellSkipped, { borderColor: skipColor }], !editable && styles.cellLocked,
                ]}>
                  <TextInput
                    style={styles.cell}
                    value={row.reps}
                    onChangeText={(v) => editable && updateRow(i, 'reps', v)}
                    onFocus={() => { if (editable) { isEditingRef.current = true; setFocused(`r${i}`); } }}
                    onBlur={() => { if (editable) onRepsBlur(); else setFocused(null); }}
                    keyboardType="numeric"
                    returnKeyType="done"
                    placeholder=""
                    editable={editable}
                  />
                  {editable && !row.skipped && row.reps === '' && focused !== `r${i}` && (
                    <View pointerEvents="none" style={styles.cellPlaceholder}>
                      <Text style={styles.cellPlaceholderText}>{repsSuggestion}</Text>
                    </View>
                  )}
                </View>
                <Pressable
                  disabled={skipDisabled}
                  onPress={() => toggleSkipRow(i)}
                  style={[
                    styles.skipCell,
                    row.skipped && [styles.skipCellActive, { borderColor: skipColor }],
                    skipDisabled && styles.cellLocked,
                  ]}
                >
                  <MaterialIcons
                    name={row.skipped ? 'cancel' : 'block'}
                    size={18}
                    color={row.skipped ? skipColor : colors.textDim}
                  />
                </Pressable>
              </View>
            );
          })}
        </View>
        </Collapsible>
      )}
    </View>
  );
}

const RING_SIZE = 184;
const OUTER_STROKE = 8;
// Flush with the shadow circle behind it (RING_SIZE/2) — any gap here exposes a sliver
// of the shadow's grey background, which reads as an odd grey contour around the ring,
// especially against the darkest overtime-lap green.
const OUTER_R = RING_SIZE / 2 - OUTER_STROKE / 2;
const RING_GAP = 6;
const INNER_STROKE = 8;
const INNER_R = OUTER_R - OUTER_STROKE / 2 - RING_GAP - INNER_STROKE / 2;
const CENTER_R = INNER_R - INNER_STROKE / 2 - 6;
const BOX_W = 42;
const BOX_H = 34;

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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  name: { color: colors.text, fontSize: font.md, flexShrink: 1 },
  exBadge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  moreBtn: { padding: 2, marginLeft: spacing.xs },
  circles: { flexDirection: 'row', gap: 3 },
  exMenuBackdrop: {
    flex: 1,
  },
  exMenuCard: {
    position: 'absolute',
    width: MENU_CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  exMenuCloseRow: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exMenuItemText: { color: colors.text, fontSize: font.sm },
  form: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  cardioForm: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { width: LABEL_W, color: colors.textMuted, fontSize: font.sm, lineHeight: 17, textAlign: 'center', textTransform: 'uppercase' },
  setGridHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  setLabelHeader: { width: LABEL_W },
  setColHeader: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  setColHeaderNarrow: {
    width: 36,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  setGridRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  cellOuter: {
    flex: 1,
    height: 32,
    position: 'relative',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  cell: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    height: 32,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    color: colors.text,
    fontSize: font.md,
    lineHeight: font.md,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  cellFocused: { borderColor: colors.accent },
  cellSaved: { borderColor: '#22C55E' },
  cellSkipped: { borderColor: SKIP_COLOR },
  cellLocked: { opacity: 0.3 },
  cellPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellPlaceholderText: {
    color: colors.textMuted,
    fontSize: font.md,
    lineHeight: font.md,
    textAlign: 'center',
  },
  skipCell: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  skipCellActive: { borderColor: SKIP_COLOR },
  timerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  centeredWrap: { alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centeredMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  centeredParamsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    maxWidth: 4 * 84 + 3 * spacing.sm,
  },
  vParamBox: { alignItems: 'center', gap: 4, width: 84 },
  paramLabel: {
    color: colors.textMuted,
    fontSize: font.sm,
    lineHeight: 17,
    textAlign: 'center',
  },
  timerRingContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    position: 'relative',
  },
  timerRingShadow: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: colors.surface2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  timerInner: {
    position: 'absolute',
    width: CENTER_R * 2,
    height: CENTER_R * 2,
    top: RING_SIZE / 2 - CENTER_R,
    left: RING_SIZE / 2 - CENTER_R,
    borderRadius: CENTER_R,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  digitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  digitBox: {
    width: BOX_W,
    height: BOX_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  digitText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600' as const,
    fontVariant: ['tabular-nums'],
  },
  digitColonSlot: {
    width: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitColon: {
    color: colors.textMuted,
    fontSize: 22,
    lineHeight: BOX_H,
  },
  timerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  timerCtrlBtn: {
    width: BOX_W,
    height: BOX_H,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  stepBtn: {
    width: 44,
    height: BOX_H,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  valueCell: {
    flex: 0,
    width: 44,
    height: BOX_H,
  },
  stepBtnText: {
    color: colors.textMuted,
    fontSize: 20,
    lineHeight: 22,
    includeFontPadding: false,
  },
  clockBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clockSheet: {
    // surface2, not surface — the boxes below are colors.surface (same as the main
    // logger's digit boxes), and need a lighter surface2 backdrop to actually stand out
    // instead of blending invisibly into a same-color sheet.
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  clockTitle: {
    color: colors.text,
    fontSize: font.md,
    fontWeight: '600' as const,
  },
  hmsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xs / 2,
  },
  // Wider than the value box itself, so full label words fit — every row uses the same
  // slot width for its left/right item, keeping all four rows aligned into two columns.
  hmsSlot: {
    width: 64,
    alignItems: 'center',
  },
  hmsColonSlot: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hmsColon: {
    color: colors.textMuted,
    fontSize: 22,
    fontWeight: '700' as const,
  },
  hmsBox: {
    width: BOX_W,
    height: BOX_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  hmsStepBtn: {
    width: BOX_W,
    height: BOX_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  hmsStepBtnText: {
    color: colors.textMuted,
    fontSize: 22,
    lineHeight: 24,
    includeFontPadding: false,
  },
  hmsValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700' as const,
    fontVariant: ['tabular-nums'],
  },
  hmsLabel: {
    color: colors.textMuted,
    fontSize: font.sm,
    fontWeight: '600' as const,
  },
  clockDoneBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
  },
  clockDoneText: {
    color: colors.bg,
    fontWeight: '600' as const,
  },
});
