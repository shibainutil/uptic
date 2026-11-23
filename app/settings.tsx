import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ActionBtn } from '../src/components/habits/ActionBtn';
import { colors, spacing, font, radius } from '../src/theme';
import { useHealthStatus, openHealthSettings, type HealthStatus } from '../src/lib/healthConnect';
import { scaleSupported, useScaleReading } from '../src/lib/scaleReader';

type MIName = React.ComponentProps<typeof MaterialIcons>['name'];

const GARMIN_CONNECT_PLAY = 'market://details?id=com.garmin.android.apps.connectmobile';
const HEALTH_CONNECT_PLAY = 'market://details?id=com.google.android.apps.healthdata';

/** App settings. For now: the devices that feed data into Uptic. */
export default function SettingsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Paired devices</Text>
          <GarminCard />
          <ScaleCard />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function statusText(s: HealthStatus | null): { text: string; color: string } {
  switch (s) {
    case null: return { text: 'Checking…', color: colors.textMuted };
    case 'connected': return { text: 'Connected', color: colors.success };
    case 'no-permission': return { text: 'Not connected', color: colors.textMuted };
    case 'unsupported': return { text: 'Needs app update', color: colors.textMuted };
    case 'update-required': return { text: 'Update Health Connect', color: colors.danger };
    case 'unavailable': return { text: 'Health Connect missing', color: colors.danger };
  }
}

function GarminCard() {
  const { status, connect } = useHealthStatus();
  const st = statusText(status);
  return (
    <DeviceCard icon="watch" name="Garmin watch" detail="Steps, distance and calories via Health Connect" status={st}>
      {status === 'connected' && (
        <>
          <Text style={styles.note}>
            Data arrives after the watch syncs with Garmin Connect. If steps stay at 0, check that Health Connect is
            switched on in Garmin Connect (More › Settings › Connected Apps › Health Connect).
          </Text>
          <View style={styles.actions}>
            <ActionBtn label="Health Connect" icon="tune" scheme="grey" onPress={openHealthSettings} />
          </View>
        </>
      )}
      {status === 'no-permission' && (
        <>
          <Text style={styles.note}>
            1. In Garmin Connect, open More › Settings › Connected Apps › Health Connect and allow steps.{'\n'}
            2. Tap Connect below and allow Uptic to read steps.
          </Text>
          <View style={styles.actions}>
            <ActionBtn label="Connect" icon="link" scheme="blue" onPress={connect} />
            <ActionBtn label="Garmin Connect" icon="open-in-new" scheme="grey" onPress={() => Linking.openURL(GARMIN_CONNECT_PLAY).catch(() => {})} />
          </View>
        </>
      )}
      {(status === 'unavailable' || status === 'update-required') && (
        <View style={styles.actions}>
          <ActionBtn label="Get Health Connect" icon="open-in-new" scheme="blue" onPress={() => Linking.openURL(HEALTH_CONNECT_PLAY).catch(() => {})} />
        </View>
      )}
      {status === 'unsupported' && (
        <Text style={styles.note}>This version of the app was built without Health Connect. Install the latest build.</Text>
      )}
    </DeviceCard>
  );
}

function ScaleCard() {
  const [testing, setTesting] = useState(false);
  const reading = useScaleReading(testing);
  const st = scaleSupported
    ? { text: 'Ready', color: colors.success }
    : { text: 'Needs app update', color: colors.textMuted };

  let live: string | null = null;
  if (testing) {
    if (reading.status === 'waiting') live = 'Step on the scale…';
    else if (reading.status === 'measuring') live = `${reading.kg?.toFixed(1)} kg…`;
    else if (reading.status === 'stable') live = `${reading.kg?.toFixed(1)} kg`;
    else live = reading.message ?? 'Could not read the scale.';
  }

  return (
    <DeviceCard icon="monitor-weight" name="Bluetooth scale" detail="SMART SCALE, fills in your weight when you log it" status={st}>
      {scaleSupported ? (
        <>
          {live && (
            <View style={styles.live}>
              {(reading.status === 'waiting' || reading.status === 'measuring') && <ActivityIndicator size="small" color={colors.accent} />}
              <Text style={[styles.liveText, reading.status === 'stable' && { color: colors.success }]}>{live}</Text>
            </View>
          )}
          <View style={styles.actions}>
            <ActionBtn
              label={testing ? 'Stop' : 'Test scale'}
              icon={testing ? 'stop' : 'play-arrow'}
              scheme={testing ? 'grey' : 'blue'}
              onPress={() => setTesting((v) => !v)}
            />
          </View>
        </>
      ) : (
        <Text style={styles.note}>This version of the app was built without the scale reader. Install the latest build.</Text>
      )}
    </DeviceCard>
  );
}

function DeviceCard({ icon, name, detail, status, children }: {
  icon: MIName; name: string; detail: string; status: { text: string; color: string }; children?: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <MaterialIcons name={icon} size={28} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.deviceName}>{name}</Text>
          <Text style={styles.deviceDetail}>{detail}</Text>
        </View>
        <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
      </View>
      {children}
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
  body: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  sectionLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, gap: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  deviceName: { color: colors.text, fontSize: font.lg, fontWeight: '600' },
  deviceDetail: { color: colors.textMuted, fontSize: font.sm },
  status: { fontSize: font.sm, fontWeight: '600' },
  note: { color: colors.textMuted, fontSize: font.sm, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  live: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveText: { color: colors.text, fontSize: font.lg, fontWeight: '600' },
});
