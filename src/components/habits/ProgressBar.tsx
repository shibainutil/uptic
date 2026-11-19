import { View, Text, StyleSheet } from 'react-native';
import type { SessionSlot } from '../../lib/habitSchedule';
import { colors, spacing, font } from '../../theme';

const TARGET_COLOR = '#EAB308';

function barColor(rate: number): string {
  if (rate >= 0.9) return colors.success;
  if (rate >= 0.5) return TARGET_COLOR;
  return colors.danger;
}

/** Done ÷ every non-paused slot up to and including today. */
export function slotsRate(slots: SessionSlot[], today: string): number {
  const considered = slots.filter((s) => s.date <= today && s.status !== 'paused');
  if (considered.length === 0) return 0;
  return considered.filter((s) => s.status === 'done').length / considered.length;
}

export function ProgressBar({ rate }: { rate: number }) {
  const pct = Math.round(Math.min(Math.max(rate, 0), 1) * 100);
  const color = barColor(rate);
  return (
    <View style={st.row}>
      <View style={st.track}>
        <View style={[st.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[st.pct, { color }]}>{pct}%</Text>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  track: {
    flex: 1, height: 7, backgroundColor: colors.surface2,
    borderRadius: 4, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  // Fixed width (fits "100%") keeps bars the same length across cards; right-aligned.
  pct: { fontSize: font.sm, fontWeight: '700', width: 34, textAlign: 'right' },
});
