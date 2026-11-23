import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Segmented } from '../ui/Segmented';
import { DatePicker } from '../ui/DatePicker';
import { colors, spacing } from '../../theme';
import { todayISO } from '../../lib/schedule';
import { scaleSupported, useScaleReading, type ScaleState } from '../../lib/scaleReader';
import { fromKg, type WeightEntry, type WeightUnit } from '../../types/weight';

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
  // Once the user types a weight themselves, the scale stops overwriting it.
  const [typed, setTyped] = useState(false);
  const scale = useScaleReading(visible && !entry && scaleSupported);

  useEffect(() => {
    if (scale.status !== 'stable' || scale.kg == null || typed) return;
    setValue(fromKg(scale.kg, unit).toFixed(1));
  }, [scale.status, scale.kg, unit, typed]);

  useEffect(() => {
    if (!visible) return;
    setTyped(false);
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

        {!entry && scaleSupported && <ScaleStatusRow scale={scale} unit={unit} />}

        <View style={styles.valueRow}>
          <Input
            label="Weight"
            value={value}
            onChangeText={(t) => {
              setTyped(true);
              setValue(t);
            }}
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

function ScaleStatusRow({ scale, unit }: { scale: ScaleState & { retry: () => void }; unit: WeightUnit }) {
  const reading = scale.kg != null ? `${fromKg(scale.kg, unit).toFixed(1)} ${unit}` : '';
  let icon: keyof typeof MaterialIcons.glyphMap = 'bluetooth-searching';
  let color = colors.textMuted;
  let text = 'Step on the scale…';
  let canRetry = false;
  switch (scale.status) {
    case 'measuring':
      text = `Measuring… ${reading}`;
      color = colors.accent;
      break;
    case 'stable':
      icon = 'check-circle';
      color = colors.success;
      text = `Scale: ${reading}`;
      break;
    case 'permission':
    case 'bluetooth-off':
    case 'error':
      icon = 'bluetooth-disabled';
      color = colors.danger;
      text = scale.message ?? 'Scale unavailable';
      canRetry = true;
      break;
  }
  return (
    <Pressable onPress={canRetry ? scale.retry : undefined} style={styles.scaleRow}>
      <MaterialIcons name={icon} size={18} color={color} />
      <Text style={[styles.scaleText, { color }]}>{text}</Text>
      {canRetry && <Text style={styles.scaleRetry}>Retry</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scaleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scaleText: { flex: 1, fontSize: 14 },
  scaleRetry: { color: colors.accent, fontSize: 14, fontWeight: '600' },
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
