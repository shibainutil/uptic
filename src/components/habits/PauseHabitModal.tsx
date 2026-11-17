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
  /** `until` is the last paused day; omitted = paused until resumed. */
  onSave: (from: string, until?: string) => void;
  onClose: () => void;
}

/** Pause a habit from a date, for a set period or until the user turns it back on. */
export function PauseHabitModal({ visible, today, onSave, onClose }: Props) {
  const [from, setFrom] = useState(today);
  const [mode, setMode] = useState<Mode>('until');
  const [until, setUntil] = useState(addDays(today, 14));

  function save() {
    if (mode === 'until' && until < from) {
      Alert.alert('Check the dates', 'The pause can’t end before it starts.');
      return;
    }
    onSave(from, mode === 'until' ? until : undefined);
  }

  return (
    <Modal title="Pause habit" visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <DatePicker label="Pause from" value={from} onChange={setFrom} />
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
        <Button label="Pause" variant="primary" onPress={save} />
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
