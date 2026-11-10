import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { usePillars } from '../../store/pillarStore';
import { useProjects } from '../../store/projectStore';
import { ActionSheet, type ActionSheetItem } from '../ui/ActionSheet';
import type { Pillar } from '../../types/pillars';

interface Props {
  /** The pillar whose options are shown; null hides the sheet. */
  pillar: Pillar | null;
  onClose: () => void;
  /** Called after the pillar is deleted (e.g. to leave its overview screen). */
  onDeleted?: () => void;
}

function errorAlert(e: unknown) {
  Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
}

function plural(n: number, word: string) {
  return `${n} ${word}${n !== 1 ? 's' : ''}`;
}

/**
 * ☰ menu for a pillar: Edit, Archive / Unarchive, Delete.
 * Archiving needs every project done; deleting needs no projects at all.
 */
export function PillarOptionsSheet({ pillar, onClose, onDeleted }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { setArchived, remove } = usePillars(user?.uid);
  const { projects } = useProjects(user?.uid);

  const items: ActionSheetItem[] = [];
  if (pillar) {
    const own = projects.filter((p) => p.pillarId === pillar.id);
    const open = own.filter((p) => !p.completedAt).length;

    items.push({ label: 'Edit', icon: 'edit', onPress: () => router.push(`/pillars/edit/${pillar.id}`) });

    if (pillar.archivedAt) {
      items.push({ label: 'Unarchive', icon: 'unarchive', onPress: () => setArchived(pillar.id, false).catch(errorAlert) });
    } else {
      items.push({
        label: 'Archive',
        icon: 'archive',
        muted: open > 0,
        onPress: () => {
          if (open > 0) {
            Alert.alert("Can't archive yet", `"${pillar.name}" still has ${plural(open, 'open project')}. Finish, move or delete them first.`);
            return;
          }
          Alert.alert('Archive Pillar', `Hide "${pillar.name}" from your pillars and projects? You can unarchive it any time.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Archive', onPress: () => setArchived(pillar.id, true).catch(errorAlert) },
          ]);
        },
      });
    }

    items.push({
      label: 'Delete',
      icon: 'delete-outline',
      destructive: true,
      onPress: () => {
        if (own.length > 0) {
          Alert.alert(
            "Can't delete",
            `"${pillar.name}" has ${plural(own.length, 'project')}. `
              + (open === 0 ? 'Archive it instead to keep its history.' : 'Move or delete them first.'),
          );
          return;
        }
        Alert.alert('Delete Pillar', `Remove "${pillar.name}"? This can't be undone.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => remove(pillar.id).then(onDeleted, errorAlert) },
        ]);
      },
    });
  }

  return <ActionSheet visible={!!pillar} title={pillar?.name} items={items} onClose={onClose} />;
}
