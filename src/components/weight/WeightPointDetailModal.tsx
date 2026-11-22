import { View, Text, StyleSheet } from 'react-native';
import { Modal } from '../ui/Modal';
import { colors, spacing, font } from '../../theme';
import { fromISO } from '../../lib/schedule';
import { formatPeriodLabel, type PeriodMode, type WeightPeriod } from '../../lib/weightPeriods';
import { deltaColor, formatDelta, fromKg, type WeightUnit } from '../../types/weight';

interface Props {
  visible: boolean;
  onClose: () => void;
  period: WeightPeriod | null;
  mode: PeriodMode;
  unit: WeightUnit;
  deltaVsPrevKg: number | null;
}

function formatEntryDate(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function WeightPointDetailModal({ visible, onClose, period, mode, unit, deltaVsPrevKg }: Props) {
  if (!period) return null;
  const fmt = (kg: number) => `${fromKg(kg, unit).toFixed(1)} ${unit}`;

  return (
    <Modal title={formatPeriodLabel(period, mode)} visible={visible} onClose={onClose}>
      <View style={styles.rows}>
        <View style={styles.row}>
          <Text style={styles.label}>Average</Text>
          <Text style={styles.value}>{fmt(period.avgKg)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Since previous {mode}</Text>
          <Text style={[styles.value, deltaColor(deltaVsPrevKg)]}>
            {deltaVsPrevKg == null ? '—' : formatDelta(deltaVsPrevKg, unit)}
          </Text>
        </View>
        {period.entries.length > 1 && (
          <View style={styles.row}>
            <Text style={styles.label}>Range</Text>
            <Text style={styles.value}>{fromKg(period.minKg, unit).toFixed(1)} – {fmt(period.maxKg)}</Text>
          </View>
        )}
        <View style={styles.divider} />
        {[...period.entries].reverse().map((e) => (
          <View key={e.id} style={styles.row}>
            <Text style={styles.label}>{formatEntryDate(e.date)}</Text>
            <Text style={styles.entryValue}>{e.value.toFixed(1)} {e.unit}</Text>
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rows: { gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  label: { color: colors.textMuted, fontSize: font.sm },
  value: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  entryValue: { color: colors.text, fontSize: font.sm },
  divider: { height: 1, backgroundColor: colors.border },
});
