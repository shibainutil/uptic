import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HabitsScreen } from '../../src/components/habits/HabitsScreen';
import { useAuth } from '../../src/context/AuthContext';
import { useMigrateLegacyHabitSchema } from '../../src/store/habitStore';
import { colors } from '../../src/theme';

export default function HabitsTab() {
  const { user } = useAuth();
  useMigrateLegacyHabitSchema(user?.uid);
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <HabitsScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
