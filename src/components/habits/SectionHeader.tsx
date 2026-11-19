import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing } from '../../theme';

const LINE = 18;

/** Collapsible section header; count and arrow share the label's colour and line box. */
export function SectionHeader({ label, color = colors.textMuted, count, open, onToggle }: {
  label: string; color?: string; count: number; open: boolean; onToggle: () => void;
}) {
  return (
    <Pressable style={st.header} onPress={onToggle} hitSlop={6}>
      <Text style={[st.text, st.label, { color }]}>{label}</Text>
      <View style={st.right}>
        <Text style={[st.text, { color }]}>{count}</Text>
        <MaterialIcons name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={LINE} color={color} />
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.xs, paddingHorizontal: 2,
  },
  text: {
    fontSize: 11, fontWeight: '700', lineHeight: LINE,
    includeFontPadding: false, textAlignVertical: 'center',
  },
  label: { textTransform: 'uppercase', letterSpacing: 0.6 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4, height: LINE },
});
