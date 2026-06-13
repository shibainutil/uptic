import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, radius, spacing, font } from '../../theme';

interface Props {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}

export function Picker({ options, value, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
      <View style={styles.row}>
        {options.map((opt) => (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.chip, value === opt && styles.chipActive]}
          >
            <Text style={[styles.chipText, value === opt && styles.chipTextActive]}>{opt}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}22`,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: font.sm,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.accent,
  },
});
