import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../store/projectStore';
import { ActionSheet, type ActionSheetItem } from '../ui/ActionSheet';
import { todayISO } from '../../lib/schedule';
import type { Project } from '../../types/projects';

interface Props {
  /** The project whose options are shown; null hides the sheet. */
  project: Project | null;
  onClose: () => void;
  /** Called after the project is deleted (e.g. to leave its overview screen). */
  onDeleted?: () => void;
}

function errorAlert(e: unknown) {
  Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
}

/**
 * ☰ menu for a project: Edit, Add milestone, Delete. A project without
 * milestones can also be completed / reopened by hand; with milestones it
 * completes itself once they're all met.
 */
export function ProjectOptionsSheet({ project, onClose, onDeleted }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { update, remove } = useProjects(user?.uid);

  const items: ActionSheetItem[] = [];
  if (project) {
    items.push({ label: 'Edit', icon: 'edit', onPress: () => router.push(`/projects/edit/${project.id}`) });
    items.push({
      label: 'Add milestone',
      icon: 'add-task',
      onPress: () => router.push({ pathname: '/projects/milestone/[id]', params: { id: 'new', projectId: project.id } }),
    });
    if (project.milestones.length === 0) {
      items.push(project.completedAt
        ? { label: 'Reopen', icon: 'undo', onPress: () => update(project.id, { completedAt: undefined }).catch(errorAlert) }
        : { label: 'Mark as done', icon: 'emoji-events', onPress: () => update(project.id, { completedAt: todayISO() }).catch(errorAlert) });
    }
    items.push({
      label: 'Delete',
      icon: 'delete-outline',
      destructive: true,
      onPress: () => Alert.alert('Delete Project', `Remove "${project.name}" and its milestones? Linked habits stay.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => remove(project.id).then(onDeleted, errorAlert) },
      ]),
    });
  }

  return <ActionSheet visible={!!project} title={project?.name} items={items} onClose={onClose} />;
}
