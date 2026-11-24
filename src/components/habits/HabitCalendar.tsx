import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, PixelRatio } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { toISO } from '../../lib/schedule';
import type { SessionSlot, SlotStatus } from '../../lib/habitSchedule';
import { colors, font, spacing, radius, themeMode } from '../../theme';

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Dot colour per session status. */
const DOT_COLOR: Record<SlotStatus, string> = {
  done: colors.success,
  skipped: colors.danger,
  overdue: '#F97316',
  today: colors.accent,
  later: '#A855F7',
  upcoming: colors.textDim,
  paused: '#EAB308',
};

// Paused-day fills, pre-blended over colors.surface (#1E1E1E dark / #FFFFFF light) at
// 18 % / 9 % yellow. They are opaque on purpose: semi-transparent fills on neighbouring
// cells showed thin lines where rows met (edges blending twice or leaving a sub-pixel gap).
const PAUSED_FILL = themeMode === 'light' ? '#FBF1D3' : '#43391A';
const PAUSED_FILL_OUT = themeMode === 'light' ? '#FDF8E9' : '#302B1C';

interface Cell { date: Date; inMonth: boolean }

function buildMonthGrid(year: number, month: number): Cell[] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7; // Monday-first
  const cells: Cell[] = [];
  for (let d = leading; d > 0; d--) cells.push({ date: new Date(year, month, 1 - d), inMonth: false });
  for (let d = 1; d <= days; d++) cells.push({ date: new Date(year, month, d), inMonth: true });
  let trailing = 1;
  while (cells.length % 7 !== 0) cells.push({ date: new Date(year, month + 1, trailing++), inMonth: false });
  return cells;
}

interface Props {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
  slots: SessionSlot[];
  today: string;
  pausedOn?: (iso: string) => boolean;
}

export function HabitCalendar({ year, month, onChange, slots, today, pausedOn }: Props) {
  const [rowWidth, setRowWidth] = useState(0);
  const byDate = new Map<string, SessionSlot[]>();
  for (const s of slots) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

  const cells = buildMonthGrid(year, month);
  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const pausedTint = ({ date, inMonth }: Cell): string | undefined =>
    pausedOn?.(toISO(date)) ? (inMonth ? PAUSED_FILL : PAUSED_FILL_OUT) : undefined;

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    onChange(d.getFullYear(), d.getMonth());
  };

  // Round to the nearest physical pixel so all 6 sized columns land on exact pixel
  // boundaries. The 7th column (Sunday) uses flex:1 to absorb any sub-pixel remainder
  // — this avoids both inter-column gaps and dead space on the right edge.
  const cw = rowWidth > 0 ? PixelRatio.roundToNearestPixel(rowWidth / 7) : 0;
  const colWidth = (col: number) => col < 6 ? (cw > 0 ? { width: cw } : { flex: 1 }) : { flex: 1 };

  return (
    <View style={styles.card}>
      <View style={styles.nav}>
        <Pressable onPress={() => shift(-1)} style={styles.navBtn} hitSlop={8}>
          <MaterialIcons name="chevron-left" size={24} color={colors.accent} />
        </Pressable>
        <Text style={styles.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
        <Pressable onPress={() => shift(1)} style={styles.navBtn} hitSlop={8}>
          <MaterialIcons name="chevron-right" size={24} color={colors.accent} />
        </Pressable>
      </View>

      <View
        style={styles.headerRow}
        onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
      >
        {DAY_LABELS.map((d, i) => (
          <Text key={d} style={[styles.dayHeader, colWidth(i)]}>{d}</Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map(({ date, inMonth }, di) => {
            const iso = toISO(date);
            const isToday = iso === today;
            const dots = inMonth ? byDate.get(iso) ?? [] : [];
            const tint = pausedTint(week[di]);
            // Same tint in the cell to the right / below: overlap it by a pixel so no seam
            // can show between the two (the colours are opaque, so the overlap is invisible).
            const right = di < 6 && pausedTint(week[di + 1]) === tint;
            const below = wi < weeks.length - 1 && pausedTint(weeks[wi + 1][di]) === tint;
            return (
              <View key={di} style={[styles.dayCell, colWidth(di)]}>
                {tint && (
                  <View
                    pointerEvents="none"
                    style={[styles.pausedFill, { backgroundColor: tint, right: right ? -1 : 0, bottom: below ? -1 : 0 }]}
                  />
                )}
                {isToday && <View pointerEvents="none" style={styles.todayRing} />}
                <Text style={[styles.dayNumber, isToday && styles.dayNumberToday, !inMonth && styles.dayNumberOut]}>
                  {date.getDate()}
                </Text>
                <View style={styles.dotRow}>
                  {dots.length > 0
                    ? dots.map((s) => <View key={s.key} style={[styles.dot, { backgroundColor: DOT_COLOR[s.status] }]} />)
                    : <View style={[styles.dot, styles.dotHidden]} />}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  navBtn: { padding: spacing.xs },
  monthLabel: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  headerRow: { flexDirection: 'row' },
  weekRow: { flexDirection: 'row' },
  dayHeader: {
    textAlign: 'center', color: colors.textMuted,
    fontSize: font.sm, fontWeight: '500', paddingVertical: spacing.sm,
  },
  // Cells have no border or background of their own: the paused fill and today's outline
  // are overlays, so neither shifts the cell's contents nor leaves seams between rows.
  dayCell: {
    alignItems: 'center', paddingTop: spacing.sm + 1.5, paddingBottom: spacing.xs + 1.5, height: 48,
  },
  todayRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1.5, borderColor: colors.accent },
  pausedFill: { position: 'absolute', top: 0, left: 0 },
  dayNumber: { color: colors.text, fontSize: font.md },
  dayNumberToday: { color: colors.accent, fontWeight: '700' },
  dayNumberOut: { opacity: 0.35 },
  dotRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center',
    gap: 3, marginTop: 3, maxWidth: '100%',
  },
  dot: { width: 5, height: 5, borderRadius: 999 },
  dotHidden: { backgroundColor: 'transparent' },
});
