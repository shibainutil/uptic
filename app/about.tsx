import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { ActionBtn } from '../src/components/habits/ActionBtn';
import { colors, spacing, font, radius } from '../src/theme';

function formatDateTime(d: Date | null | undefined): string {
  if (!d) return '—';
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date}, ${time}`;
}

type CheckState =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'done'; message: string }
  | { kind: 'ready' };

/** General information about the app: version, build, the running update and the device. */
export default function AboutScreen() {
  const router = useRouter();
  const [installedAt, setInstalledAt] = useState<Date | null>(null);
  const [appUpdatedAt, setAppUpdatedAt] = useState<Date | null>(null);
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' });

  useEffect(() => {
    Application.getInstallationTimeAsync().then(setInstalledAt).catch(() => {});
    if (Platform.OS === 'android') Application.getLastUpdateTimeAsync().then(setAppUpdatedAt).catch(() => {});
  }, []);

  const isDevBuild = __DEV__ || (Application.applicationId ?? '').endsWith('.dev');
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '—';
  const build = Application.nativeBuildVersion;
  const canCheckForUpdates = Updates.isEnabled && !__DEV__;

  // The JS that is running right now: the bundle built into the app, or an over-the-air update.
  let runningCode: string;
  if (__DEV__) runningCode = 'Development server';
  else if (!Updates.isEnabled) runningCode = 'Built-in';
  else if (Updates.isEmbeddedLaunch) runningCode = 'Built-in (no update yet)';
  else runningCode = 'Over-the-air update';

  async function checkForUpdate() {
    try {
      setCheck({ kind: 'busy', label: 'Checking…' });
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setCheck({ kind: 'done', message: 'You have the latest version.' });
        return;
      }
      setCheck({ kind: 'busy', label: 'Downloading…' });
      await Updates.fetchUpdateAsync();
      setCheck({ kind: 'ready' });
    } catch (e) {
      setCheck({ kind: 'done', message: e instanceof Error ? e.message : 'Could not check for updates.' });
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <Text style={styles.headerTitle}>About</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Image source={require('../assets/logo.png')} style={styles.logo} />
          <Text style={styles.appName}>Uptic{isDevBuild ? ' Dev' : ''}</Text>
          <Text style={styles.tagline}>Version {version}{build ? ` (${build})` : ''}</Text>
        </View>

        <Section title="App">
          <Row label="Version" value={version} />
          {build != null && <Row label="Build" value={build} />}
          <Row label="Variant" value={isDevBuild ? 'Development' : 'Release'} />
          <Row label="Installed" value={formatDateTime(installedAt)} />
          {Platform.OS === 'android' && <Row label="App last updated" value={formatDateTime(appUpdatedAt)} />}
        </Section>

        <Section title="Updates">
          <Row label="Running" value={runningCode} />
          {!__DEV__ && Updates.isEnabled && !Updates.isEmbeddedLaunch && (
            <>
              <Row label="Update published" value={formatDateTime(Updates.createdAt)} />
              <Row label="Update ID" value={Updates.updateId ? Updates.updateId.slice(0, 8) : '—'} />
            </>
          )}
          <Row label="Channel" value={Updates.channel || Constants.expoConfig?.updates?.requestHeaders?.['expo-channel-name'] || '—'} />
          <Row label="Runtime version" value={Updates.runtimeVersion ?? version} />
          {Updates.isEmergencyLaunch && (
            <Text style={styles.warning}>
              The latest update failed to load, so the built-in version is running.
              {Updates.emergencyLaunchReason ? ` (${Updates.emergencyLaunchReason})` : ''}
            </Text>
          )}

          {canCheckForUpdates && (
            <View style={styles.updateActions}>
              {check.kind === 'busy' ? (
                <View style={styles.busy}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.muted}>{check.label}</Text>
                </View>
              ) : check.kind === 'ready' ? (
                <>
                  <Text style={styles.muted}>An update is ready.</Text>
                  <ActionBtn label="Restart to update" icon="restart-alt" scheme="blue" onPress={() => { Updates.reloadAsync().catch(() => {}); }} />
                </>
              ) : (
                <>
                  {check.kind === 'done' && <Text style={styles.muted}>{check.message}</Text>}
                  <ActionBtn label="Check for updates" icon="system-update" scheme="grey" onPress={checkForUpdate} />
                </>
              )}
            </View>
          )}
        </Section>

        <Section title="Device">
          <Row label="Platform" value={`${Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : Platform.OS} ${Platform.Version}`} />
          <Row label="Expo SDK" value={Constants.expoConfig?.sdkVersion ?? '—'} />
          <Row label="React Native" value={reactNativeVersion()} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function reactNativeVersion(): string {
  const v = (Platform.constants as { reactNativeVersion?: { major: number; minor: number; patch: number } }).reactNativeVersion;
  return v ? `${v.major}.${v.minor}.${v.patch}` : '—';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} selectable>{value}</Text>
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
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  logo: { width: 80, height: 80, borderRadius: 20, marginBottom: spacing.sm },
  appName: { color: colors.text, fontSize: 24, fontWeight: '700' },
  tagline: { color: colors.textMuted, fontSize: font.md },
  section: { gap: spacing.sm },
  sectionLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textMuted, fontSize: font.md },
  rowValue: { color: colors.text, fontSize: font.md, flexShrink: 1, textAlign: 'right' },
  warning: { color: colors.danger, fontSize: font.sm, paddingVertical: spacing.md },
  updateActions: { alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.md },
  busy: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muted: { color: colors.textMuted, fontSize: font.sm },
});
