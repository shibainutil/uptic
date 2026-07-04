import { useRef } from 'react';
import { View, Text, PanResponder, StyleSheet } from 'react-native';
import { colors, font } from '../../theme';

interface Props {
  value: number; // 0-59
  onChange: (v: number) => void;
  size?: number;
}

const DEFAULT_SIZE = 220;
const LABELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function angleToValue(dx: number, dy: number): number {
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (deg < 0) deg += 360;
  return Math.round((deg / 360) * 60) % 60;
}

export function ClockDial({ value, onChange, size = DEFAULT_SIZE }: Props) {
  const center = size / 2;
  const radius = size / 2 - 26;

  const handleTouch = useRef((x: number, y: number) => {
    onChange(angleToValue(x - center, y - center));
  });
  handleTouch.current = (x: number, y: number) => {
    onChange(angleToValue(x - center, y - center));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => handleTouch.current(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (e) => handleTouch.current(e.nativeEvent.locationX, e.nativeEvent.locationY),
    }),
  ).current;

  const angleDeg = (value / 60) * 360;
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  const handleX = center + radius * Math.cos(angleRad);
  const handleY = center + radius * Math.sin(angleRad);

  return (
    <View
      style={[styles.dial, { width: size, height: size, borderRadius: size / 2 }]}
      {...panResponder.panHandlers}
    >
      <View pointerEvents="none" style={[styles.hand, { width: radius, top: center - 1, left: center, transform: [{ rotate: `${angleDeg}deg` }] }]} />
      <View pointerEvents="none" style={[styles.centerDot, { left: center - 3, top: center - 3 }]} />
      {LABELS.map((n) => {
        const a = ((n / 60) * 360 - 90) * Math.PI / 180;
        const lx = center + radius * Math.cos(a);
        const ly = center + radius * Math.sin(a);
        return (
          <Text key={n} pointerEvents="none" style={[styles.label, { left: lx - 12, top: ly - 10 }]}>
            {String(n).padStart(2, '0')}
          </Text>
        );
      })}
      <View pointerEvents="none" style={[styles.handle, { left: handleX - 18, top: handleY - 18 }]}>
        <Text style={styles.handleText}>{String(value).padStart(2, '0')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dial: {
    position: 'relative',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hand: {
    position: 'absolute',
    height: 2,
    backgroundColor: colors.accent,
  },
  centerDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  label: {
    position: 'absolute',
    width: 24,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: font.sm,
  },
  handle: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleText: {
    color: colors.bg,
    fontSize: font.sm,
    fontWeight: '700' as const,
  },
});
