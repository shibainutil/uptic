import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HabitsScreen } from '../../src/components/habits/HabitsScreen';
import { useAuth } from '../../src/context/AuthContext';
import { useMigrateLegacyHabitSchema } from '../../src/store/habitStore';
import { useBottomBarAction } from '../../src/store/bottomBarStore';
import { colors } from '../../src/theme';

export default function HabitsTab() {
  const { user } = useAuth();
  const router = useRouter();
  useMigrateLegacyHabitSchema(user?.uid);
  useBottomBarAction('Add habit', 'add', () => router.push('/habits/habit/new'));
  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <HabitsScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
