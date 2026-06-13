import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, font } from '../../theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ label, onPress, variant = 'ghost', disabled, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.dangerDim,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  label: {
    fontSize: font.md,
    fontWeight: '600',
  },
  primaryLabel: { color: '#fff' },
  ghostLabel: { color: colors.textMuted },
  dangerLabel: { color: colors.danger },
});
