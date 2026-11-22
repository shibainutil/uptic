import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useHabits, useHabitLogEntries } from '../src/store/habitStore';
import { useNow } from '../src/hooks/useNow';
import { fromISO, todayISO } from '../src/lib/schedule';
import {
  currentHabitNotifications, notificationsSupported, showHabitNotification, upcomingHabitNotifications,
  type SessionNotification,
} from '../src/lib/habitNotifications';
import { ActionBtn } from '../src/components/habits/ActionBtn';
import { colors, spacing, font, radius } from '../src/theme';

const OVERDUE_COLOR = '#F97316';
const MAX_UPCOMING = 20;

function errorAlert(e: unknown) {
  Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
}

/** Habit notifications: the ones that apply now (to show again) and the ones still to come. */
export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { habits, loaded: habitsLoaded } = useHabits(user?.uid);
  const { entries, loaded: entriesLoaded } = useHabitLogEntries(user?.uid);
  const now = useNow();
  const loaded = habitsLoaded && entriesLoaded;
  const today = todayISO();

  const current = loaded ? currentHabitNotifications(habits, entries, today, now) : [];
  const upcoming = loaded ? upcomingHabitNotifications(habits, entries, today, now).slice(0, MAX_UPCOMING) : [];

  const show = (n: SessionNotification) => { showHabitNotification(n).catch(errorAlert); };
  const showAll = () => {
    (async () => { for (const n of current) await showHabitNotification(n); })().catch(errorAlert);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {!notificationsSupported && <Text style={styles.empty}>Notifications only work in the phone app.</Text>}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Now</Text>
          {current.length > 0 && <ActionBtn label="Show all on phone" icon="notifications-active" scheme="grey" onPress={showAll} />}
        </View>
        {!loaded ? <Text style={styles.empty}>Loading…</Text>
          : current.length === 0 ? <Text style={styles.empty}>Nothing is due or overdue.</Text>
          : current.map((n) => <Row key={`${n.habit.id}|${n.slot.key}`} n={n} onShow={() => show(n)} />)}

        <Text style={[styles.sectionLabel, styles.sectionGap]}>Coming up</Text>
        {loaded && upcoming.length === 0 && <Text style={styles.empty}>Nothing scheduled.</Text>}
        {upcoming.map((n) => (
          <Row key={`${n.habit.id}|${n.slot.key}|${n.phase}`} n={n} onShow={() => show(n)} when={n.at} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ n, onShow, when }: { n: SessionNotification; onShow: () => void; when?: number }) {
  const overdue = n.phase === 'overdue';
  const tint = overdue ? OVERDUE_COLOR : colors.accent;
  const date = fromISO(n.slot.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const at = when != null ? new Date(when) : undefined;
  const fires = at
    ? `Notifies ${at.toLocaleDateString(undefined, { weekday: 'short' })} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    : undefined;
  return (
    <View style={[styles.row, { borderColor: when == null ? tint : colors.surface2 }]}>
      <MaterialIcons name={overdue ? 'error-outline' : 'radio-button-unchecked'} size={24} color={tint} />
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {n.habit.name} · <Text style={{ color: tint }}>{overdue ? 'Overdue' : 'Due'}</Text>
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>{date} · {n.slot.time}{fires ? `  ·  ${fires}` : ''}</Text>
      </View>
      <ActionBtn label="Show" icon="notifications" scheme="grey" onPress={onShow} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface, gap: spacing.sm,
  },
  back: { minWidth: 48 },
  backText: { color: colors.accent, fontSize: font.md },
  headerTitle: { flex: 1, color: colors.text, fontSize: font.lg, fontWeight: '600', textAlign: 'center' },
  list: { padding: spacing.lg, gap: spacing.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sectionGap: { marginTop: spacing.lg },
  empty: { color: colors.textDim, fontSize: font.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: font.md },
  rowSub: { color: colors.textDim, fontSize: font.sm },
});
