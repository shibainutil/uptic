import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CalendarModal } from './CalendarModal';
import { colors, font, spacing, radius } from '../../theme';
import { fromISO } from '../../lib/schedule';

interface Props {
  /** Field label shown above the trigger. */
  label?: string;
  /** Selected date as ISO yyyy-mm-dd. */
  value: string;
  onChange: (iso: string) => void;
}

export function DatePicker({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = fromISO(value);

  const display = selected.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <MaterialIcons name="event" size={18} color={colors.accent} />
        <Text style={styles.triggerText}>{display}</Text>
      </Pressable>

      <CalendarModal
        visible={open}
        value={value}
        onSelect={(iso) => { onChange(iso); setOpen(false); }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  triggerText: { color: colors.text, fontSize: font.md },
});
