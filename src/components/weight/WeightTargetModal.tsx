import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Segmented } from '../ui/Segmented';
import { Toggle } from '../ui/Toggle';
import { DatePicker } from '../ui/DatePicker';
import { colors, spacing, font } from '../../theme';
import { todayISO, addDays } from '../../lib/schedule';
import type { WeightTarget, WeightUnit } from '../../types/weight';

interface Props {
  visible: boolean;
  onClose: () => void;
  target: WeightTarget | null;
  defaultUnit: WeightUnit;
  onSave: (value: number, unit: WeightUnit, byDate?: string) => Promise<unknown>;
  onClear: () => Promise<unknown>;
}

export function WeightTargetModal({ visible, onClose, target, defaultUnit, onSave, onClear }: Props) {
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<WeightUnit>(defaultUnit);
  const [hasDeadline, setHasDeadline] = useState(false);
  const [byDate, setByDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setValue(target ? String(target.value) : '');
    setUnit(target?.unit ?? defaultUnit);
    setHasDeadline(!!target?.byDate);
    setByDate(target?.byDate ?? addDays(todayISO(), 90));
  }, [visible, target, defaultUnit]);

  const numeric = parseFloat(value);
  const canSave = !Number.isNaN(numeric) && numeric > 0;

  async function save() {
    setSaving(true);
    try {
      await onSave(numeric, unit, hasDeadline ? byDate : undefined);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await onClear();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Target Weight" visible={visible} onClose={onClose}>
      <View style={styles.form}>
        <View style={styles.valueRow}>
          <Input
            label="Target"
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

        <View style={styles.deadlineRow}>
          <Text style={styles.deadlineLabel}>Set a deadline</Text>
          <Toggle value={hasDeadline} onChange={setHasDeadline} />
        </View>
        {hasDeadline && <DatePicker label="Reach it by" value={byDate} onChange={setByDate} />}

        <View style={styles.actions}>
          {target && <Button label="Remove" variant="danger" onPress={handleClear} disabled={saving} style={styles.flex1} />}
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
  deadlineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deadlineLabel: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: spacing.md },
});
