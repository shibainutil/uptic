import { Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useHabitLogEntries } from '../../store/habitStore';
import { useMetricPromptStore } from '../../store/metricPromptStore';
import { LogEntryModal } from './LogEntryModal';

/** Mounted once at the root: shows the value prompt opened by "Done" on a metric habit. */
export function MetricLogHost() {
  const { user } = useAuth();
  const { add } = useHabitLogEntries(user?.uid);
  const { prompt, close } = useMetricPromptStore();
  if (!prompt) return null;

  return (
    <LogEntryModal
      visible
      habit={prompt.habit}
      initialLoggedAt={prompt.loggedAt}
      onSave={(loggedAt, notes, count, values) => {
        Promise.resolve(add({ habitId: prompt.habit.id, loggedAt, notes: notes || undefined, count, values }))
          .catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.'));
        close();
      }}
      onClose={close}
    />
  );
}
