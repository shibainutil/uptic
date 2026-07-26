import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { spacing, radius } from '../../theme';
import { NUTRIENT_COLORS, NUTRIENT_ICONS } from '../../types/nutrition';

const ORDER: (keyof typeof NUTRIENT_COLORS)[] = ['calories', 'fat', 'carbs', 'fibre', 'protein'];

interface Props {
  values: Partial<Record<keyof typeof NUTRIENT_COLORS, number>>;
}

export function NutrientBadgeRow({ values }: Props) {
  return (
    <View style={styles.wrap}>
      {ORDER.filter((k) => values[k] != null).map((k) => (
        <View key={k} style={[styles.badge, { backgroundColor: `${NUTRIENT_COLORS[k]}33` }]}>
          <MaterialIcons name={NUTRIENT_ICONS[k]} size={10} color={NUTRIENT_COLORS[k]} />
          <Text style={[styles.badgeText, { color: NUTRIENT_COLORS[k] }]}>{Math.round(values[k]!)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm - 4,
  },
  badgeText: { fontSize: 10, fontWeight: '600' },
});
