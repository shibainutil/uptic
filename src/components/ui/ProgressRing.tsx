import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, font, spacing } from '../../theme';

interface Props {
  /** 0..1 */
  rate: number;
  label: string;
  size?: number;
  strokeWidth?: number;
}

const SEGMENTS = 32;

const RED: [number, number, number] = [239, 68, 68];
const YELLOW: [number, number, number] = [234, 179, 8];
const GREEN: [number, number, number] = [34, 197, 94];

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Colors keyed to absolute circle position: red→yellow at 1/3, yellow→green at 2/3. */
export function ringColor(t: number): string {
  if (t <= 1 / 3) return mix(RED, YELLOW, t / (1 / 3));
  if (t <= 2 / 3) return `rgb(${YELLOW[0]}, ${YELLOW[1]}, ${YELLOW[2]})`;
  return mix(YELLOW, GREEN, (t - 2 / 3) / (1 / 3));
}

export function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function ProgressRing({ rate, label, size = 48, strokeWidth = 5 }: Props) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const clampedRate = Math.max(0, Math.min(rate, 1));
  const filledSegments = Math.round(clampedRate * SEGMENTS);
  const step = 360 / SEGMENTS;

  return (
    <View style={styles.wrapper}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={radius} stroke={colors.surface2} strokeWidth={strokeWidth} fill="none" />
          {Array.from({ length: filledSegments }, (_, i) => (
            <Path
              key={i}
              d={describeArc(cx, cy, radius, i * step, (i + 1) * step)}
              stroke={ringColor(i / SEGMENTS)}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={[styles.pct, { fontSize: size * 0.26 }]}>{Math.round(clampedRate * 100)}</Text>
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
