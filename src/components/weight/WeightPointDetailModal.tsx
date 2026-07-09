import { View, Text, StyleSheet } from 'react-native';
import { Modal } from '../ui/Modal';
import { colors, spacing, font } from '../../theme';
import { fromISO } from '../../lib/schedule';
import { deltaColor, formatDelta, type WeightEntry } from '../../types/weight';

interface Props {
  visible: boolean;
  onClose: () => void;
  entry: WeightEntry | null;
  deltaVsPrevKg: number | null;
  deltaVsWeekKg: number | null;
}

function formatFullDate(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function WeightPointDetailModal({ visible, onClose, entry, deltaVsPrevKg, deltaVsWeekKg }: Props) {
  if (!entry) return null;

  return (
    <Modal title={formatFullDate(entry.date)} visible={visible} onClose={onClose}>
      <View style={styles.rows}>
        <View style={styles.row}>
          <Text style={styles.label}>Value</Text>
          <Text style={styles.value}>{entry.value.toFixed(1)} {entry.unit}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Since previous</Text>
          <Text style={[styles.value, deltaColor(deltaVsPrevKg)]}>
            {deltaVsPrevKg == null ? '—' : formatDelta(deltaVsPrevKg, entry.unit)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Since 1 week ago</Text>
          <Text style={[styles.value, deltaColor(deltaVsWeekKg)]}>
            {deltaVsWeekKg == null ? '—' : formatDelta(deltaVsWeekKg, entry.unit)}
          </Text>
        </View>
        {entry.note ? (
          <View style={styles.row}>
            <Text style={styles.label}>Note</Text>
            <Text style={styles.value}>{entry.note}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rows: { gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  label: { color: colors.textMuted, fontSize: font.sm },
  value: { color: colors.text, fontSize: font.md, fontWeight: '600' },
});
