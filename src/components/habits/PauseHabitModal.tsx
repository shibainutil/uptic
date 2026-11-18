import { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Modal } from '../ui/Modal';
import { DatePicker } from '../ui/DatePicker';
import { Segmented } from '../ui/Segmented';
import { Button } from '../ui/Button';
import { addDays } from '../../lib/schedule';
import { colors, spacing, font } from '../../theme';

type Mode = 'until' | 'resume';

const MODES: { value: Mode; label: string }[] = [
  { value: 'until', label: 'Until a date' },
  { value: 'resume', label: 'Until I resume' },
];

interface Props {
  visible: boolean;
  today: string;
  /** Pre-fill when editing an existing pause. */
  initialFrom?: string;
  initialUntil?: string;
  /** `until` is the last paused day; omitted = paused until resumed. */
  onSave: (from: string, until?: string) => void;
  /** If provided, shows a Remove button to delete this pause entirely. */
  onDelete?: () => void;
  onClose: () => void;
}

/** Pause a habit from a date, for a set period or until the user turns it back on. */
export function PauseHabitModal({ visible, today, initialFrom, initialUntil, onSave, onDelete, onClose }: Props) {
  const defaultFrom = initialFrom ?? today;
  const defaultUntil = initialUntil ?? addDays(defaultFrom, 14);
  const [from, setFrom] = useState(defaultFrom);
  const [mode, setMode] = useState<Mode>(initialUntil != null ? 'until' : initialFrom != null ? 'resume' : 'until');
  const [until, setUntil] = useState(defaultUntil);

  function handleFromChange(newFrom: string) {
    setFrom(newFrom);
    // Keep until at least one day after from
    if (until <= newFrom) setUntil(addDays(newFrom, 1));
  }

  function save() {
    if (mode === 'until' && until <= from) {
      Alert.alert('Check the dates', 'The end date must come after the start date.');
      return;
    }
    onSave(from, mode === 'until' ? until : undefined);
  }

  return (
    <Modal title="Pause habit" visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <DatePicker label="Pause from" value={from} onChange={handleFromChange} />
        <View style={styles.field}>
          <Text style={styles.label}>Until</Text>
          <Segmented options={MODES} value={mode} onChange={setMode} />
        </View>
        {mode === 'until' ? (
          <DatePicker label="Last day paused" value={until} onChange={setUntil} />
        ) : null}
        <Text style={styles.hint}>
          {mode === 'until'
            ? 'Sessions in this period are moved to after it, so a session goal just finishes later. Nothing counts against the habit while it is paused.'
            : 'Sessions scheduled from the start date on are removed. Resume the habit when you are ready and it picks up from that day.'}
        </Text>
        <Button label="Save" variant="primary" onPress={save} />
        {onDelete && (
          <Button label="Remove pause" variant="danger" onPress={onDelete} />
        )}
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
  hint: { color: colors.textDim, fontSize: font.sm, lineHeight: 18 },
});
