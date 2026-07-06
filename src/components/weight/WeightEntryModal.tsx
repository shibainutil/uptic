import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Segmented } from '../ui/Segmented';
import { DatePicker } from '../ui/DatePicker';
import { spacing } from '../../theme';
import { todayISO } from '../../lib/schedule';
import type { WeightEntry, WeightUnit } from '../../types/weight';

interface Props {
  visible: boolean;
  onClose: () => void;
  entry?: WeightEntry;
  defaultUnit: WeightUnit;
  onSave: (data: { date: string; value: number; unit: WeightUnit; note?: string }) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

export function WeightEntryModal({ visible, onClose, entry, defaultUnit, onSave, onDelete }: Props) {
  const [date, setDate] = useState(todayISO());
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<WeightUnit>(defaultUnit);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDate(entry?.date ?? todayISO());
    setValue(entry ? String(entry.value) : '');
    setUnit(entry?.unit ?? defaultUnit);
    setNote(entry?.note ?? '');
  }, [visible, entry, defaultUnit]);

  const numeric = parseFloat(value);
  const canSave = !Number.isNaN(numeric) && numeric > 0;

  async function save() {
    setSaving(true);
    try {
      await onSave({ date, value: numeric, unit, note: note.trim() || undefined });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry) return;
    setSaving(true);
    try {
      await onDelete(entry.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={entry ? 'Edit Weight' : 'Log Weight'} visible={visible} onClose={onClose}>
      <View style={styles.form}>
        <DatePicker label="Date" value={date} onChange={setDate} disabled={!!entry} />

        <View style={styles.valueRow}>
          <Input
            label="Weight"
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder="0.0"
            style={[styles.flex1, styles.weightInput]}
          />
          <View style={styles.unitToggle}>
            <Segmented
              options={[{ value: 'kg', label: 'kg' }, { value: 'lbs', label: 'lbs' }]}
              value={unit}
              onChange={setUnit}
            />
          </View>
        </View>

        <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. after workout" />

        <View style={styles.actions}>
          {entry && <Button label="Delete" variant="danger" onPress={handleDelete} disabled={saving} style={styles.flex1} />}
          <Button label="Save" variant="primary" onPress={save} disabled={!canSave || saving} style={styles.flex1} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  valueRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-end' },
  flex1: { flex: 1 },
  weightInput: {
    fontSize: 28,
    fontWeight: '700',
    paddingVertical: spacing.md + 4,
    minWidth: 110,
  },
  unitToggle: { width: 100 },
  actions: { flexDirection: 'row', gap: spacing.md },
});
