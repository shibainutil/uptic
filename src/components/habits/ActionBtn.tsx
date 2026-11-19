import { Pressable, Text, View, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, font, radius } from '../../theme';

export const PAUSE_COLOR = '#EAB308';
export const PAUSE_BG = 'rgba(234,179,8,0.10)';
export const PAUSE_BORDER = 'rgba(234,179,8,0.35)';

type MIName = React.ComponentProps<typeof MaterialIcons>['name'];
export type ActionScheme = 'blue' | 'green' | 'red' | 'grey' | 'yellow';

const SCHEMES: Record<ActionScheme, { color: string; bg: string; border: string }> = {
  blue:   { color: colors.accent,    bg: `${colors.accent}20`,  border: `${colors.accent}50`  },
  green:  { color: colors.success,   bg: `${colors.success}20`, border: `${colors.success}50` },
  red:    { color: colors.danger,    bg: `${colors.danger}20`,  border: `${colors.danger}50`  },
  grey:   { color: colors.textMuted, bg: colors.surface2,        border: colors.border         },
  yellow: { color: PAUSE_COLOR,      bg: PAUSE_BG,               border: PAUSE_BORDER          },
};

export function ActionBtn({ label, icon, scheme, onPress }: {
  label: string; icon: MIName; scheme: ActionScheme; onPress: () => void;
}) {
  const c = SCHEMES[scheme];
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[st.btn, { backgroundColor: c.bg, borderColor: c.border }]}>
      <MaterialIcons name={icon} size={14} color={c.color} />
      <Text style={[st.text, { color: c.color }]}>{label}</Text>
    </Pressable>
  );
}

/** Buttons shown side by side (e.g. Skip + Done) — same gap on every screen. */
export function ActionBtnGroup({ children }: { children: React.ReactNode }) {
  return <View style={st.group}>{children}</View>;
}

const st = StyleSheet.create({
  group: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm, borderWidth: 1,
  },
  text: { fontSize: font.sm, fontWeight: '600' },
});
