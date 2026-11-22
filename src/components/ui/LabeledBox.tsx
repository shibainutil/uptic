import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../../theme';

const LABEL_SIZE = 11;
const LINE = LABEL_SIZE + 4;
const INSET = 12;
// Capitals sit above the line box's centre (room for descenders); nudge the label down
// so the border runs through the middle of the letters.
const NUDGE = 1;
// Vertical room reserved above the box for an optional element centred on the top-right border.
const RIGHT_ROOM = 28;

/** A bordered box whose label sits in a gap in its top edge (like a fieldset legend).
 * `right` is an optional element (a badge, a small toggle) centred on the top border at the
 * right; it should have an opaque background so the border doesn't show through it. */
export function LabeledBox({ label, labelColor = colors.textMuted, style, right, children }: {
  label: string;
  labelColor?: string;
  style?: StyleProp<ViewStyle>;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const flat = StyleSheet.flatten(style) ?? {};
  const bw = (flat.borderWidth as number | undefined) ?? 1;
  const boxBg = flat.backgroundColor ?? 'transparent';
  // With a right element, the room above the border is padding (inside this view) rather than
  // margin, so the element's upper half stays within bounds and receives touches on Android.
  const top = right ? RIGHT_ROOM / 2 : 0;
  const labelTop = top - LINE / 2 + NUDGE;

  return (
    <View style={right ? { paddingTop: top } : st.wrap}>
      <View style={style}>{children}</View>
      <View style={[st.legend, { top: labelTop }]} pointerEvents="none">
        {/* Covers only the border segment behind the text. Page colour + the box's own
            (possibly translucent) background stacked = exactly what's inside the box. */}
        <View style={[st.mask, { top: top - labelTop, height: bw, backgroundColor: colors.bg }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: boxBg }]} />
        </View>
        <Text style={[st.legendText, { color: labelColor }]}>{label}</Text>
      </View>
      {right ? (
        <View style={[st.right, { height: RIGHT_ROOM }]} pointerEvents="box-none">
          {right}
        </View>
      ) : null}
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
  right: { position: 'absolute', top: 0, right: INSET, justifyContent: 'center' },
});
