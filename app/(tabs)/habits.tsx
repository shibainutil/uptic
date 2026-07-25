import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HabitLogTab } from '../../src/components/habits/HabitLogTab';
import { HabitsListTab } from '../../src/components/habits/HabitsListTab';
import { useAuth } from '../../src/context/AuthContext';
import { useMigrateLegacyHabitSchema } from '../../src/store/habitStore';
import { colors, spacing, font } from '../../src/theme';

const SUB_TABS = [
  { key: 'log',    label: 'Log' },
  { key: 'habits', label: 'Habits' },
] as const;

type SubTab = typeof SUB_TABS[number]['key'];

export default function HabitsScreen() {
  const [tab, setTab] = useState<SubTab>('log');
  const { user } = useAuth();
  useMigrateLegacyHabitSchema(user?.uid);

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
        {tab === 'log'    && <HabitLogTab />}
        {tab === 'habits' && <HabitsListTab />}
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
