import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExercisesTab } from '../../src/components/gym/ExercisesTab';
import { RoutinesTab } from '../../src/components/gym/RoutinesTab';
import { LoggerTab } from '../../src/components/gym/LoggerTab';
import { useAuth } from '../../src/context/AuthContext';
import { useRoutines, useRoutineExecutions, useRoutineReconcile } from '../../src/store/gymStore';
import { colors, spacing, font } from '../../src/theme';

const SUB_TABS = [
  { key: 'tracker',   label: 'Logger' },
  { key: 'exercises', label: 'Exercises' },
  { key: 'routines',  label: 'Routines' },
] as const;

type SubTab = typeof SUB_TABS[number]['key'];

export default function FitnessScreen() {
  const [tab, setTab] = useState<SubTab>('tracker');

  // Generate/expire routine executions while the fitness module is open.
  const { user } = useAuth();
  const { routines } = useRoutines(user?.uid);
  const { routineExecutions, loaded: executionsLoaded } = useRoutineExecutions(user?.uid);
  useRoutineReconcile(user?.uid, routines, routineExecutions, executionsLoaded);

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
        {tab === 'tracker'   && <LoggerTab />}
        {tab === 'exercises' && <ExercisesTab />}
        {tab === 'routines'  && <RoutinesTab />}
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
