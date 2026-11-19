import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../../theme';

const LABEL_SIZE = 11;
const LINE = LABEL_SIZE + 4;
const INSET = 12;
// Capitals sit above the line box's centre (room for descenders); nudge the label down
// so the border runs through the middle of the letters.
const NUDGE = 1;

/** A bordered box whose label sits in a gap in its top edge (like a fieldset legend). */
export function LabeledBox({ label, labelColor = colors.textMuted, style, children }: {
  label: string;
  labelColor?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const flat = StyleSheet.flatten(style) ?? {};
  const bw = (flat.borderWidth as number | undefined) ?? 1;
  const boxBg = flat.backgroundColor ?? 'transparent';
  const labelTop = -LINE / 2 + NUDGE;

  return (
    <View style={st.wrap}>
      <View style={style}>{children}</View>
      <View style={[st.legend, { top: labelTop }]} pointerEvents="none">
        {/* Covers only the border segment behind the text. Page colour + the box's own
            (possibly translucent) background stacked = exactly what's inside the box. */}
        <View style={[st.mask, { top: -labelTop, height: bw, backgroundColor: colors.bg }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: boxBg }]} />
        </View>
        <Text style={[st.legendText, { color: labelColor }]}>{label}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: LINE / 2 },
  // alignSelf keeps the legend (and its mask) to the label's own width; without it the
  // parent's default align-items: stretch widens it and hides the whole top border.
  legend: { position: 'absolute', left: INSET, alignSelf: 'flex-start', paddingHorizontal: 5 },
  mask: { position: 'absolute', left: 0, right: 0 },
  legendText: {
    fontSize: LABEL_SIZE, lineHeight: LINE,
    fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, includeFontPadding: false,
  },
});
