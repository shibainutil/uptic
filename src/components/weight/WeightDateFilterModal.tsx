import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { DatePicker } from '../ui/DatePicker';
import { spacing } from '../../theme';
import { todayISO } from '../../lib/schedule';

export interface DateRange {
  from: string;
  to: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  value: DateRange | null;
  onApply: (range: DateRange) => void;
  onClear: () => void;
}

export function WeightDateFilterModal({ visible, onClose, value, onApply, onClear }: Props) {
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());

  useEffect(() => {
    if (!visible) return;
    setFrom(value?.from ?? todayISO());
    setTo(value?.to ?? todayISO());
  }, [visible, value]);

  function apply() {
    onApply(from <= to ? { from, to } : { from: to, to: from });
    onClose();
  }

  function clear() {
    onClear();
    onClose();
  }

  return (
    <Modal title="Filter by Date" visible={visible} onClose={onClose}>
      <View style={styles.form}>
        <DatePicker label="From" value={from} onChange={setFrom} />
        <DatePicker label="To" value={to} onChange={setTo} />
        <View style={styles.actions}>
          {value && <Button label="Clear" variant="danger" onPress={clear} style={styles.flex1} />}
          <Button label="Apply" variant="primary" onPress={apply} style={styles.flex1} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex1: { flex: 1 },
});
