import { Pressable, View, Text, StyleSheet } from 'react-native';
import { colors, font, spacing } from '../../theme';

interface Props {
  value: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export function Toggle({ value, onChange, label }: Props) {
  return (
    <Pressable style={styles.row} onPress={() => onChange(!value)} hitSlop={6}>
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    padding: 2,
  },
  trackOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  knob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.textMuted,
  },
  knobOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },
  label: { color: colors.text, fontSize: font.md },
});
