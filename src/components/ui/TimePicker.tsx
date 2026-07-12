import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, font, radius, spacing } from '../../theme';

interface Props {
  /** "HH:MM" 24h. */
  value: string;
  onChange: (value: string) => void;
}

function parse(value: string): [number, number] {
  const [h, m] = value.split(':').map((n) => parseInt(n, 10));
  return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
}

function format(h: number, m: number): string {
  const nh = ((h % 24) + 24) % 24;
  const nm = ((m % 60) + 60) % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function Stepper({ value, onIncrement, onDecrement }: { value: number; onIncrement: () => void; onDecrement: () => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onDecrement} style={styles.stepBtn} hitSlop={8}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{String(value).padStart(2, '0')}</Text>
      <Pressable onPress={onIncrement} style={styles.stepBtn} hitSlop={8}>
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export function TimePicker({ value, onChange }: Props) {
  const [h, m] = parse(value);
  return (
    <View style={styles.row}>
      <Stepper value={h} onIncrement={() => onChange(format(h + 1, m))} onDecrement={() => onChange(format(h - 1, m))} />
      <Text style={styles.colon}>:</Text>
      <Stepper value={m} onIncrement={() => onChange(format(h, m + 1))} onDecrement={() => onChange(format(h, m - 1))} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  colon: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs,
  },
  stepBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  stepBtnText: { color: colors.accent, fontSize: font.md, fontWeight: '700' },
  stepValue: { color: colors.text, fontSize: font.md, fontWeight: '600', minWidth: 24, textAlign: 'center' },
});
