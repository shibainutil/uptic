import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { WeightTracker } from '../../src/components/weight/WeightTracker';
import { colors } from '../../src/theme';

export default function WeightScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <WeightTracker />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
});
