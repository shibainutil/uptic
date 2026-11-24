import { useCallback, useState } from 'react';
import { AppState, View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ProgressRing } from '../../src/components/ui/ProgressRing';
import { ActionBtn } from '../../src/components/habits/ActionBtn';
import { colors, spacing, font, radius } from '../../src/theme';
import { readActivity, useHealthStatus, type DayActivity } from '../../src/lib/healthConnect';
import { useAuth } from '../../src/context/AuthContext';
import { useStepDays } from '../../src/store/stepsStore';
import { localDate } from '../../src/store/waterStore';

const STEP_GOAL = 10000;
const DAYS = 7;

function dayLabel(date: string, i: number) {
  if (i === 0) return 'Today';
  if (i === 1) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The last DAYS local dates, newest first. */
function lastDates(): string[] {
  const d = new Date();
  return Array.from({ length: DAYS }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
    return localDate(x);
  });
}

/**
 * Steps from the Garmin watch. Prefers what the Uptic Steps watch app sends from the
 * watch's own counter (stored in Firestore); falls back to Health Connect, where Garmin
 * Connect exports them, when the watch app hasn't sent anything.
 */
export default function StepsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { status, connect } = useHealthStatus();
  const dates = lastDates();
  const { days: watchDays } = useStepDays(user?.uid, dates[dates.length - 1]);
  const fromWatch = watchDays.length > 0;
  const [hcDays, setDays] = useState<DayActivity[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setDays(await readActivity(DAYS));
    } catch {
      setDays([]);
    }
  }, []);

  // Garmin Connect writes to Health Connect whenever the watch syncs, so read again each
  // time the tab is opened and whenever the app comes back to the foreground (this also
  // moves "Today" on after midnight).
  useFocusEffect(useCallback(() => {
    if (status !== 'connected' || fromWatch) return;
    load();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    return () => sub.remove();
  }, [status, load, fromWatch]));

  const days: DayActivity[] | null = fromWatch
    ? dates.map((date) => {
      const w = watchDays.find((d) => d.date === date);
      return { date, steps: w?.steps ?? 0, distanceKm: (w?.metres ?? 0) / 1000, activeKcal: w?.kcal ?? 0 };
    })
    : hcDays;

  if (!fromWatch && status === null) return <View style={styles.container} />;

  if (!fromWatch && status !== 'connected') {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>👟</Text>
        <Text style={styles.emptyTitle}>Connect your Garmin</Text>
        <Text style={styles.emptyText}>
          {status === 'unsupported'
            ? 'This version of the app was built without Health Connect. Install the latest build.'
            : 'Uptic reads your steps from Health Connect, where Garmin Connect saves them after each watch sync.'}
        </Text>
        <View style={styles.emptyActions}>
          {status === 'no-permission' && <ActionBtn label="Connect" icon="link" scheme="blue" onPress={connect} />}
          <ActionBtn label="Paired devices" icon="settings" scheme="grey" onPress={() => router.push('/settings')} />
        </View>
      </View>
    );
  }

  const today = days?.[0];
  const max = Math.max(STEP_GOAL, ...(days ?? []).map((d) => d.steps));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.accent}
          colors={[colors.accent]}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
        />
      }
    >
      <View style={styles.hero}>
        <ProgressRing rate={Math.min(1, (today?.steps ?? 0) / STEP_GOAL)} label={(today?.steps ?? 0).toLocaleString()} size={180} />
        <Text style={styles.goal}>of {STEP_GOAL.toLocaleString()} steps today</Text>
        <View style={styles.stats}>
          <Stat label="Distance" value={today ? `${today.distanceKm.toFixed(2)} km` : '—'} />
          <Stat label={fromWatch ? 'Calories' : 'Active calories'} value={today ? `${Math.round(today.activeKcal)} kcal` : '—'} />
        </View>
      </View>

      <Text style={styles.sectionLabel}>Last {DAYS} days</Text>
      <View style={styles.card}>
        {(days ?? []).map((d, i) => (
          <View key={d.date} style={styles.dayRow}>
            <Text style={styles.dayLabel}>{dayLabel(d.date, i)}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.bar,
                  { width: `${(d.steps / max) * 100}%`, backgroundColor: d.steps >= STEP_GOAL ? colors.success : colors.accent },
                ]}
              />
            </View>
            <Text style={styles.dayValue}>{d.steps.toLocaleString()}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.hint}>
        {fromWatch
          ? 'Straight from your watch, updated every 5 minutes by the Uptic Steps watch app.'
          : 'Pull down to refresh. New steps show up after your watch syncs with Garmin Connect.'}
      </Text>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.md },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  goal: { color: colors.textMuted, fontSize: font.md },
  stats: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
  stat: { alignItems: 'center' },
  statValue: { color: colors.text, fontSize: font.xl, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: font.sm },
  sectionLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, gap: spacing.md,
  },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dayLabel: { color: colors.textMuted, fontSize: font.sm, width: 92 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surface2, overflow: 'hidden' },
  bar: { height: 10, borderRadius: 5 },
  dayValue: { color: colors.text, fontSize: font.sm, width: 56, textAlign: 'right' },
  hint: { color: colors.textDim, fontSize: font.sm, textAlign: 'center' },
  empty: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: colors.text, fontSize: font.lg, fontWeight: '600' },
  emptyText: { color: colors.textMuted, fontSize: font.md, textAlign: 'center' },
  emptyActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
