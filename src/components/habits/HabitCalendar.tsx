import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { toISO } from '../../lib/schedule';
import type { SessionSlot, SlotStatus } from '../../lib/habitSchedule';
import { colors, font, spacing, radius } from '../../theme';

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Dot colour per session status. */
const DOT_COLOR: Record<SlotStatus, string> = {
  done: colors.success,
  skipped: colors.danger,
  today: colors.accent,
  upcoming: colors.textDim,
  paused: '#EAB308',
};

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
  month: number;                       // 0-based
  onChange: (year: number, month: number) => void;
  slots: SessionSlot[];
  today: string;                       // ISO yyyy-mm-dd
  /** Days the habit is paused; shaded. */
  pausedOn?: (iso: string) => boolean;
}

/** Month grid like the fitness routine calendar: day numbers with a dot per scheduled session. */
export function HabitCalendar({ year, month, onChange, slots, today, pausedOn }: Props) {
  const byDate = new Map<string, SessionSlot[]>();
  for (const s of slots) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

  const cells = buildMonthGrid(year, month);
  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    onChange(d.getFullYear(), d.getMonth());
  };

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

      <View style={styles.weekRow}>
        {DAY_LABELS.map((d) => <Text key={d} style={styles.dayHeader}>{d}</Text>)}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map(({ date, inMonth }, di) => {
            const iso = toISO(date);
            const isToday = iso === today;
            const dots = inMonth ? byDate.get(iso) ?? [] : [];
            const paused = inMonth && !!pausedOn?.(iso);
            return (
              <View key={di} style={[styles.dayCell, paused && styles.dayCellPaused, isToday && styles.dayCellToday]}>
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
  weekRow: { flexDirection: 'row' },
  dayHeader: {
    flex: 1, textAlign: 'center', color: colors.textMuted,
    fontSize: font.sm, fontWeight: '500', paddingVertical: spacing.sm,
  },
  dayCell: { flex: 1, alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs, height: 48 },
  dayCellPaused: { backgroundColor: `${colors.textDim}2A` },
  dayCellToday: { backgroundColor: `${colors.accent}18` },
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
