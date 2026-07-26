import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, font, spacing, radius } from '../../theme';
import { NUTRIENT_COLORS, NUTRIENT_ICONS, NUTRIENT_LABELS, NUTRIENT_UNITS } from '../../types/nutrition';

const GREEN = colors.success;
const ORANGE = '#FB8C00';
const RED = colors.danger;
const GREY = colors.textDim;

interface Props {
  nutrient: keyof typeof NUTRIENT_COLORS;
  current: number;
  min: number;
  max: number;
}

function statusColor(current: number, min: number, max: number): string {
  if (current === 0) return GREY;
  if (current < min) return ORANGE;
  if (current > max) return RED;
  return GREEN;
}

export function NutritionTargetBar({ nutrient, current, min, max }: Props) {
  const [width, setWidth] = useState(0);
  const color = NUTRIENT_COLORS[nutrient];
  const status = statusColor(current, min, max);

  let scaleMin = min;
  let scaleMax = max;
  if (current === 0) { scaleMin = min; scaleMax = max; }
  else if (current < min) { scaleMin = current; scaleMax = max; }
  else if (current > max) { scaleMin = min; scaleMax = current; }
  const range = Math.max(scaleMax - scaleMin, 1);

  function pct(v: number) {
    return Math.max(0, Math.min(1, (v - scaleMin) / range));
  }

  function onLayout(e: LayoutChangeEvent) { setWidth(e.nativeEvent.layout.width); }

  const minPct = pct(min);
  const maxPct = pct(max);
  const markerPct = pct(current);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={[styles.pill, { backgroundColor: `${color}26` }]}>
          <MaterialIcons name={NUTRIENT_ICONS[nutrient]} size={13} color={color} />
          <Text style={[styles.pillText, { color }]}>{NUTRIENT_LABELS[nutrient]} ({NUTRIENT_UNITS[nutrient]})</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: `${status}26` }]}>
          <Text style={[styles.pillText, { color: status }]}>{current === 0 ? '—' : Math.round(current)}</Text>
        </View>
      </View>

      <View style={styles.barTrack} onLayout={onLayout}>
        {width > 0 && (
          <>
            {current > 0 && current < min && (
              <View style={[styles.zone, { left: 0, width: minPct * width, backgroundColor: `${ORANGE}40` }]} />
            )}
            <View style={[styles.zone, { left: minPct * width, width: Math.max((maxPct - minPct) * width, 0), backgroundColor: `${GREEN}40` }]} />
            {current > max && (
              <View style={[styles.zone, { left: maxPct * width, width: (1 - maxPct) * width, backgroundColor: `${RED}40` }]} />
            )}
            {current > 0 && (
              <View style={[styles.marker, { left: Math.max(0, Math.min(width - 3, markerPct * width - 1.5)), backgroundColor: status }]} />
            )}
          </>
        )}
      </View>

      <View style={styles.labelRow}>
        <Text style={styles.axisLabel}>{Math.round(scaleMin)}</Text>
        <Text style={styles.axisLabel}>min {min}</Text>
        <Text style={styles.axisLabel}>max {max}</Text>
        <Text style={styles.axisLabel}>{Math.round(scaleMax)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm,
  },
  pillText: { fontSize: 11, fontWeight: '700' },
  barTrack: {
    height: 10, borderRadius: 5, backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  zone: { position: 'absolute', top: 0, bottom: 0 },
  marker: { position: 'absolute', top: -2, bottom: -2, width: 3, borderRadius: 2 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { fontSize: 9, color: colors.textDim },
});
