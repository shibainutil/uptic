import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Modal } from '../ui/Modal';
import { DatePicker } from '../ui/DatePicker';
import { TimePicker } from '../ui/TimePicker';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { colors, spacing, font, radius } from '../../theme';
import { toISO, fromISO } from '../../lib/schedule';
import type { HabitLogEntry } from '../../types/habits';

const MAX_COUNT = 50;

interface Props {
  visible: boolean;
  entry?: HabitLogEntry;
  onSave: (loggedAt: string, notes: string, count: number) => void;
  onDelete?: () => void;
  onClose: () => void;
}

function splitDateTime(iso: string): [string, string] {
  const d = new Date(iso);
  return [toISO(d), `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`];
}

export function LogEntryModal({ visible, entry, onSave, onDelete, onClose }: Props) {
  const [date, time] = splitDateTime(entry?.loggedAt ?? new Date().toISOString());
  const [d, setD] = useState(date);
  const [t, setT] = useState(time);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [count, setCount] = useState(entry?.count ?? 1);

  function save() {
    const base = fromISO(d);
    const [h, m] = t.split(':').map(Number);
    base.setHours(h, m, 0, 0);
    onSave(base.toISOString(), notes.trim(), Math.max(1, Math.min(count, MAX_COUNT)));
  }

  return (
    <Modal title={entry ? 'Edit Session' : 'Log Session'} visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <DatePicker label="Date" value={d} onChange={setD} />
        <View style={styles.field}>
          <Text style={styles.label}>Time</Text>
          <TimePicker value={t} onChange={setT} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>How many sessions</Text>
          <View style={styles.stepper}>
            <Pressable onPress={() => setCount((c) => Math.max(1, c - 1))} style={styles.stepBtn} hitSlop={8}>
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepCount}>{count}</Text>
            <Pressable onPress={() => setCount((c) => Math.min(MAX_COUNT, c + 1))} style={styles.stepBtn} hitSlop={8}>
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
          {count > 1 && (
            <Text style={styles.hint}>Logged as one session, ×{count} — e.g. bringing down 6 wood tiles at once.</Text>
          )}
        </View>
        <Input label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Notes" />
        <View style={styles.formRow}>
          {entry && onDelete && (
            <Button label="Delete" variant="danger" onPress={onDelete} style={styles.flex1} />
          )}
          <Button label="Save" variant="primary" onPress={save} style={styles.flex1} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.md },
  field: { gap: spacing.sm },
  label: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  hint: { color: colors.textDim, fontSize: font.sm },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  stepBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  stepBtnText: { color: colors.accent, fontSize: font.lg, fontWeight: '700' },
  stepCount: { color: colors.text, fontSize: font.md, fontWeight: '600', minWidth: 28, textAlign: 'center' },
  formRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex1: { flex: 1 },
});
