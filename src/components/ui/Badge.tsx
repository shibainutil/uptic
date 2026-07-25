import { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing } from '../../theme';

interface Props {
  label: string;
  /** Solid color; background is derived as this color at ~13% opacity. */
  color: string;
  icon?: ReactNode;
}

/**
 * The one status/label pill used across the app (fitness logger, routines,
 * habits, meal macros, …): colored text on a same-color ~13%-opacity
 * background, no border. Change the look here and it changes everywhere.
 */
export function Badge({ label, color, icon }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}22` }]}>
      {icon}
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 3,
    borderRadius: 4,
  },
  text: { fontSize: 11, lineHeight: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
