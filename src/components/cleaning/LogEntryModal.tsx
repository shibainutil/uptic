import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Modal } from '../ui/Modal';
import { DatePicker } from '../ui/DatePicker';
import { TimePicker } from '../ui/TimePicker';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { colors, spacing } from '../../theme';
import { toISO, fromISO } from '../../lib/schedule';
import type { CleaningLogEntry } from '../../types/cleaning';

interface Props {
  visible: boolean;
  entry?: CleaningLogEntry;
  onSave: (loggedAt: string, notes: string) => void;
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

  function save() {
    const base = fromISO(d);
    const [h, m] = t.split(':').map(Number);
    base.setHours(h, m, 0, 0);
    onSave(base.toISOString(), notes.trim());
  }

  return (
    <Modal title={entry ? 'Edit Session' : 'Log Session'} visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <DatePicker label="Date" value={d} onChange={setD} />
        <View style={styles.field}>
          <Text style={styles.label}>Time</Text>
          <TimePicker value={t} onChange={setT} />
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
  formRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex1: { flex: 1 },
});
