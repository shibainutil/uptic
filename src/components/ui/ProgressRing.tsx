import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, font, spacing } from '../../theme';

interface Props {
  /** 0..1 */
  rate: number;
  label: string;
  size?: number;
  strokeWidth?: number;
}

/** Red below 33%, yellow 33–66%, green 66%+. */
export function ringColor(rate: number): string {
  if (rate < 1 / 3) return colors.danger;
  if (rate < 2 / 3) return '#EAB308';
  return colors.success;
}

export function ProgressRing({ rate, label, size = 48, strokeWidth = 5 }: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - rate);
  const color = ringColor(rate);

  return (
    <View style={styles.wrapper}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2} cy={size / 2} r={radius}
            stroke={colors.surface2} strokeWidth={strokeWidth} fill="none"
          />
          <Circle
            cx={size / 2} cy={size / 2} r={radius}
            stroke={color} strokeWidth={strokeWidth} fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={[styles.pct, { fontSize: size * 0.26 }]}>{Math.round(rate * 100)}</Text>
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: spacing.xs / 2 },
  center: { alignItems: 'center', justifyContent: 'center' },
  pct: { color: colors.text, fontWeight: '700' },
  label: { color: colors.textMuted, fontSize: font.sm - 2, fontWeight: '600' },
});
