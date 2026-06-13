import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExercisesTab } from '../../src/components/gym/ExercisesTab';
import { ModulesTab } from '../../src/components/gym/ModulesTab';
import { CyclesTab } from '../../src/components/gym/CyclesTab';
import { colors, spacing, font } from '../../src/theme';

const SUB_TABS = [
  { key: 'exercises', label: 'Exercises' },
  { key: 'modules', label: 'Modules' },
  { key: 'cycles', label: 'Cycles' },
] as const;

type SubTab = typeof SUB_TABS[number]['key'];

export default function GymScreen() {
  const [tab, setTab] = useState<SubTab>('exercises');

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
        {tab === 'exercises' && <ExercisesTab />}
        {tab === 'modules' && <ModulesTab />}
        {tab === 'cycles' && <CyclesTab />}
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
  subTabText: { color: colors.textMuted, fontSize: font.md, fontWeight: '500' },
  subTabTextActive: { color: colors.accent },
  content: { flex: 1 },
});
