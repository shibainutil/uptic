import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CleaningLogTab } from '../../src/components/cleaning/CleaningLogTab';
import { CleaningTasksTab } from '../../src/components/cleaning/CleaningTasksTab';
import { useAuth } from '../../src/context/AuthContext';
import { useCleaningTasks, useCleaningSessions, useCleaningReconcile } from '../../src/store/cleaningStore';
import { colors, spacing, font } from '../../src/theme';

const SUB_TABS = [
  { key: 'log',   label: 'Log' },
  { key: 'tasks', label: 'Tasks' },
] as const;

type SubTab = typeof SUB_TABS[number]['key'];

export default function CleaningScreen() {
  const [tab, setTab] = useState<SubTab>('log');

  // Generate/expire cleaning sessions while the module is open.
  const { user } = useAuth();
  const { tasks } = useCleaningTasks(user?.uid);
  const { sessions, loaded: sessionsLoaded } = useCleaningSessions(user?.uid);
  useCleaningReconcile(user?.uid, tasks, sessions, sessionsLoaded);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.subTabBar}>
        {SUB_TABS.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.subTab, tab === t.key && styles.subTabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.subTabText, tab === t.key && styles.subTabTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.content}>
        {tab === 'log'   && <CleaningLogTab />}
        {tab === 'tasks' && <CleaningTasksTab />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  subTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  subTab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  subTabActive: { borderBottomColor: colors.accent },
  subTabText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '500' },
  subTabTextActive: { color: colors.accent },
  content: { flex: 1 },
});
