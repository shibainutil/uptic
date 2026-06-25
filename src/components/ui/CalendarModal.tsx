import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Modal } from './Modal';
import { colors, font, spacing, radius } from '../../theme';
import { fromISO, toISO } from '../../lib/schedule';

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingEmpties = (firstDay.getDay() + 6) % 7; // Monday-first
  const cells: (Date | null)[] = Array(leadingEmpties).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface Props {
  title?: string;
  visible: boolean;
  /** Selected/initial date as ISO yyyy-mm-dd. */
  value: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}

/** Calendar-only modal (no trigger). Parent controls visibility. */
export function CalendarModal({ title = 'Select date', visible, value, onSelect, onClose }: Props) {
  const selected = fromISO(value);
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  // Re-centre on the selected month each time the modal opens.
  useEffect(() => {
    if (visible) {
      setViewYear(selected.getFullYear());
      setViewMonth(selected.getMonth());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, value]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  const cells = buildMonthGrid(viewYear, viewMonth);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const today = new Date();

  return (
    <Modal title={title} visible={visible} onClose={onClose}>
      <View style={styles.monthNav}>
        <Pressable onPress={prevMonth} style={styles.navBtn} hitSlop={8}>
          <MaterialIcons name="chevron-left" size={24} color={colors.accent} />
        </Pressable>
        <Text style={styles.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <Pressable onPress={nextMonth} style={styles.navBtn} hitSlop={8}>
          <MaterialIcons name="chevron-right" size={24} color={colors.accent} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {DAY_LABELS.map((d) => <Text key={d} style={styles.dayHeader}>{d}</Text>)}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((date, di) => {
            if (!date) return <View key={di} style={styles.dayCell} />;
            const isSelected = isSameDay(date, selected);
            const isToday = isSameDay(date, today);
            return (
              <Pressable
                key={di}
                style={[styles.dayCell, isSelected && styles.dayCellSelected, isToday && !isSelected && styles.dayCellToday]}
                onPress={() => onSelect(toISO(date))}
              >
                <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected, isToday && !isSelected && styles.dayNumberToday]}>
                  {date.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </Modal>
  );
}

const styles = StyleSheet.create({
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navBtn: { padding: spacing.xs },
  monthLabel: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  weekRow: { flexDirection: 'row' },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: font.sm,
    fontWeight: '500',
    paddingVertical: spacing.xs,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  dayCellToday: { backgroundColor: `${colors.accent}18` },
  dayCellSelected: { backgroundColor: colors.accent },
  dayNumber: { color: colors.text, fontSize: font.md },
  dayNumberToday: { color: colors.accent, fontWeight: '700' },
  dayNumberSelected: { color: '#fff', fontWeight: '700' },
});
