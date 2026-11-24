import { useMemo, useState } from 'react';
import { Alert, View, Text, TextInput, ScrollView, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ProgressRing } from '../../src/components/ui/ProgressRing';
import { useAuth } from '../../src/context/AuthContext';
import { useWaterLogs, useWaterAmounts, localDate, WATER_GOAL_ML } from '../../src/store/waterStore';
import { colors, spacing, font, radius } from '../../src/theme';

const MAX_ML = 5000;
const DAYS = 7;

function fmtMl(ml: number) {
  return ml >= 1000 ? `${Number((ml / 1000).toFixed(2))} L` : `${ml} ml`;
}

function dayLabel(date: string, i: number) {
  if (i === 0) return 'Today';
  if (i === 1) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Water intake, logged in Uptic (Garmin doesn't share water with other apps). */
export default function WaterScreen() {
  const { user } = useAuth();
  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      return localDate(d);
    });
  }, []);
  const { logs, add, remove } = useWaterLogs(user?.uid, days[DAYS - 1]);
  const { amounts, addAmount, removeAmount } = useWaterAmounts(user?.uid);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const customMl = Number(custom);
  const customValid = Number.isInteger(customMl) && customMl > 0 && customMl <= MAX_ML;

  const fail = (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');

  // Logs a custom amount and keeps it in the quick-add list.
  const addCustom = () => {
    if (!customValid) return;
    add(customMl).catch(fail);
    addAmount(customMl).catch(fail);
    setCustom('');
    setCustomOpen(false);
  };

  const confirmRemove = (ml: number) =>
    Alert.alert(`Remove ${fmtMl(ml)}?`, 'It will no longer be offered for quick adding.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { removeAmount(ml).catch(fail); } },
    ]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const l of logs) t[l.date] = (t[l.date] ?? 0) + l.ml;
    return t;
  }, [logs]);
  const today = days[0];
  const todayMl = totals[today] ?? 0;
  const todayLogs = logs.filter((l) => l.date === today);
  const max = Math.max(WATER_GOAL_ML, ...days.map((d) => totals[d] ?? 0));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.body}>
      <View style={styles.hero}>
        <ProgressRing rate={Math.min(1, todayMl / WATER_GOAL_ML)} label={fmtMl(todayMl)} size={180} />
        <Text style={styles.goal}>of {fmtMl(WATER_GOAL_ML)} today</Text>
      </View>

      <View style={styles.quick}>
        {amounts.map((ml) => (
          <Pressable
            key={ml}
            style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.6 }]}
            onPress={() => { add(ml).catch(fail); }}
            onLongPress={() => confirmRemove(ml)}
          >
            <MaterialIcons name="local-drink" size={20} color={colors.accent} />
            <Text style={styles.quickText}>+{ml}</Text>
          </Pressable>
        ))}
        <Pressable
          style={({ pressed }) => [styles.quickBtn, styles.customBtn, pressed && { opacity: 0.6 }]}
          onPress={() => setCustomOpen((o) => !o)}
        >
          <MaterialIcons name={customOpen ? 'close' : 'add'} size={20} color={colors.textMuted} />
          <Text style={styles.quickText}>Custom</Text>
        </Pressable>
      </View>

      {customOpen && (
        <View style={styles.customRow}>
          <TextInput
            style={styles.customInput}
            value={custom}
            onChangeText={(t) => setCustom(t.replace(/[^0-9]/g, ''))}
            placeholder="Amount"
            placeholderTextColor={colors.textDim}
            keyboardType="number-pad"
            autoFocus
            maxLength={4}
            returnKeyType="done"
            onSubmitEditing={addCustom}
          />
          <Text style={styles.customUnit}>ml</Text>
          <Pressable
            style={({ pressed }) => [styles.customAdd, !customValid && { opacity: 0.4 }, pressed && { opacity: 0.6 }]}
            onPress={addCustom}
            disabled={!customValid}
          >
            <Text style={styles.customAddText}>Add</Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.hint}>A custom amount is kept for quick adding. Hold an amount to remove it.</Text>

      {todayLogs.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Today</Text>
          <View style={styles.card}>
            {todayLogs.map((l) => (
              <View key={l.id} style={styles.logRow}>
                <Text style={styles.logTime}>
                  {new Date(l.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={styles.logMl}>{l.ml} ml</Text>
                <Pressable onPress={() => remove(l.id)} hitSlop={10}>
                  <MaterialIcons name="close" size={18} color={colors.textDim} />
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionLabel}>Last {DAYS} days</Text>
      <View style={styles.card}>
        {days.map((d, i) => {
          const ml = totals[d] ?? 0;
          return (
            <View key={d} style={styles.dayRow}>
              <Text style={styles.dayLabel}>{dayLabel(d, i)}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { width: `${(ml / max) * 100}%`, backgroundColor: ml >= WATER_GOAL_ML ? colors.success : colors.accent }]} />
              </View>
              <Text style={styles.dayValue}>{fmtMl(ml)}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.md },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  goal: { color: colors.textMuted, fontSize: font.md },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  quickBtn: {
    width: '23%', flexGrow: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.md,
    backgroundColor: `${colors.accent}20`, borderColor: `${colors.accent}50`, borderWidth: 1, borderRadius: radius.md,
  },
  quickText: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  customBtn: { backgroundColor: colors.surface, borderColor: colors.border },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  customInput: {
    flex: 1, color: colors.text, fontSize: font.lg, backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  customUnit: { color: colors.textMuted, fontSize: font.md },
  customAdd: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  customAddText: { color: '#FFFFFF', fontSize: font.md, fontWeight: '600' },
  hint: { color: colors.textDim, fontSize: font.sm, textAlign: 'center' },
  sectionLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, gap: spacing.md,
  },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logTime: { color: colors.textMuted, fontSize: font.md, width: 64 },
  logMl: { flex: 1, color: colors.text, fontSize: font.md },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dayLabel: { color: colors.textMuted, fontSize: font.sm, width: 92 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surface2, overflow: 'hidden' },
  bar: { height: 10, borderRadius: 5 },
  dayValue: { color: colors.text, fontSize: font.sm, width: 56, textAlign: 'right' },
});
