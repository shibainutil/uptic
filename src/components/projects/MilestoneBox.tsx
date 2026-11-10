import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { View, Text, Pressable, TextInput, StyleSheet, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { NestableDraggableFlatList } from 'react-native-draggable-flatlist';
import { ActionSheet } from '../ui/ActionSheet';
import { HabitTargetRow } from './HabitTargetRow';
import { formatShortDate } from './ProjectCard';
import type { useProjects } from '../../store/projectStore';
import type { HabitCriterion, Milestone, TaskCriterion } from '../../types/projects';
import type { Habit, HabitLogEntry } from '../../types/habits';
import { colors, spacing, font, radius } from '../../theme';

// Task rows: the tickbox square and the title's line box are the same height and
// share a top edge. MaterialIcons draws the check-box square from 3 to 21 inside its
// 24-unit box, so a 24px icon pulled in by -3px renders an exact 18px square.
const ROW = 18;
const ICON = 24;
const ICON_INSET = (ICON - ROW) / 2;
// Title text sized so its ink (ascender top to descender bottom) spans the same 18px
// as the tickbox; measured on device: Roboto ink ≈ 0.87 em. TITLE_SHIFT pulls the
// first line up so the ink top meets the tickbox top.
const TITLE_SIZE = 20.5;
const TITLE_LINE = 24;
const TITLE_SHIFT = -3.4; // measured: ink top sits ~0.165 em below the line top
// The 'menu' glyph's three bars span y 6–18 and x 3–21 of its 24-unit box, so a 36px
// icon draws bars exactly 18px tall (27px wide); negative margins trim the empty box.
const HANDLE_ICON = 36;
const HANDLE_W = 27;

type TaskActions = Pick<ReturnType<typeof useProjects>,
  'setTaskDone' | 'addTask' | 'renameTask' | 'removeTask' | 'reorderTasks'>;

interface Props extends TaskActions {
  projectId: string;
  milestone: Milestone;
  index: number;
  met: boolean;
  isNext: boolean;
  accent: string;
  habits: Habit[];
  entries: HabitLogEntry[];
  today: string;
  onMenu: () => void;
  onOpenHabit: (habitId: string) => void;
  /** A text field in this box got focus; the screen scrolls it above the keyboard. */
  onInputFocus?: (input: TextInput | null) => void;
}

function errorAlert(e: unknown) {
  Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
}

/**
 * One milestone on the project overview, editable in place: tick a task with
 * its checkbox, tap its name to rename it, add tasks inline, ☰ tap for
 * Rename/Delete and ☰ hold to reorder.
 * Must be rendered inside a NestableScrollContainer.
 */
export function MilestoneBox({
  projectId, milestone: m, index, met, isNext, accent, habits, entries, today, onMenu, onOpenHabit, onInputFocus,
  setTaskDone, addTask, renameTask, removeTask, reorderTasks,
}: Props) {
  const tasks = m.criteria.filter((c): c is TaskCriterion => c.kind === 'task');
  const targets = m.criteria.filter((c): c is HabitCriterion => c.kind === 'habit');
  const overdue = !met && !!m.dueDate && today > m.dueDate;

  // Show the dropped order immediately; Firestore's snapshot catches up a moment later.
  const [dragOrder, setDragOrder] = useState<TaskCriterion[] | null>(null);
  useEffect(() => setDragOrder(null), [m]);

  const [draft, setDraft] = useState('');
  const [menuTask, setMenuTask] = useState<TaskCriterion | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const draftRef = useRef<TextInput>(null);
  const renameRef = useRef<TextInput>(null);

  // Android's back button only hides the keyboard; the field would stay focused. Blur
  // it so a rename is committed (via onBlur) and nothing is left half-edited.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      renameRef.current?.blur();
      draftRef.current?.blur();
    });
    return () => sub.remove();
  }, []);

  function submitDraft() {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    addTask(projectId, m.id, t).catch(errorAlert);
  }

  function commitRename() {
    const id = editingId;
    const t = editText.trim();
    setEditingId(null);
    const current = tasks.find((x) => x.id === id);
    if (id && t && current && t !== current.title) renameTask(projectId, m.id, id, t).catch(errorAlert);
  }

  function startRename(t: TaskCriterion) {
    setEditText(t.title);
    setEditingId(t.id);
  }

  const renderTask = (t: TaskCriterion, drag?: () => void, isActive?: boolean) => (
    <View style={[styles.task, isActive && styles.taskDragging]}>
      <Pressable
        onPress={() => setTaskDone(projectId, m.id, t.id, !t.doneAt).catch(errorAlert)}
        hitSlop={8}
        style={styles.slot}
      >
        <MaterialIcons
          name={t.doneAt ? 'check-box' : 'check-box-outline-blank'}
          size={ICON}
          color={t.doneAt ? colors.success : colors.textMuted}
          style={styles.slotIcon}
        />
      </Pressable>
      {editingId === t.id ? (
        <TextInput
          ref={renameRef}
          onFocus={() => onInputFocus?.(renameRef.current)}
          value={editText}
          onChangeText={setEditText}
          onSubmitEditing={commitRename}
          onBlur={commitRename}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          style={[styles.taskText, styles.taskEdit]}
        />
      ) : (
        <Pressable style={styles.taskName} onPress={() => startRename(t)} onLongPress={drag} delayLongPress={250}>
          <Text style={[styles.taskText, t.doneAt && styles.taskDone]}>{t.title}</Text>
        </Pressable>
      )}
      <Pressable
        onPress={() => setMenuTask(t)}
        onLongPress={tasks.length > 1 ? drag : undefined}
        delayLongPress={250}
        disabled={isActive}
        hitSlop={10}
        style={styles.handle}
      >
        <MaterialIcons name="menu" size={HANDLE_ICON} color={colors.textMuted} style={styles.handleIcon} />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.box, isNext && { borderColor: `${accent}88` }]}>
      <View style={styles.head}>
        <MaterialIcons
          name={met ? 'check-circle' : 'radio-button-unchecked'}
          size={22}
          color={met ? colors.success : isNext ? accent : colors.textDim}
        />
        <View style={styles.flex1}>
          <Text style={[styles.title, met && styles.titleMet]}>{index + 1}. {m.title}</Text>
          {m.dueDate ? (
            <Text style={[styles.due, overdue && { color: colors.danger }]}>
              {overdue ? 'Overdue · ' : 'Due '}{formatShortDate(m.dueDate)}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={onMenu} hitSlop={10}>
          <MaterialIcons name="more-vert" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <NestableDraggableFlatList
          data={dragOrder ?? tasks}
          keyExtractor={(t) => t.id}
          activationDistance={10}
          onDragEnd={({ data }) => {
            setDragOrder(data);
            reorderTasks(projectId, m.id, data.map((t) => t.id)).catch(errorAlert);
          }}
          renderItem={({ item, drag, isActive }) => renderTask(item, drag, isActive)}
        />

        <View style={styles.addRow}>
          <View style={styles.slot}>
            <MaterialIcons name="add" size={ICON} color={draft.trim() ? accent : colors.textDim} style={styles.slotIcon} />
          </View>
          <TextInput
            ref={draftRef}
            value={draft}
            onChangeText={setDraft}
            onFocus={() => onInputFocus?.(draftRef.current)}
            onSubmitEditing={submitDraft}
            placeholder="Add a task"
            placeholderTextColor={colors.textDim}
            returnKeyType="done"
            blurOnSubmit={false}
            style={styles.addInput}
          />
          {draft.trim() ? (
            <Pressable onPress={submitDraft} hitSlop={8}>
              <Text style={[styles.addBtn, { color: accent }]}>Add</Text>
            </Pressable>
          ) : null}
        </View>

        {targets.length > 0 && (
          <View style={styles.targets}>
            {targets.map((c) => (
              <HabitTargetRow
                key={c.id}
                criterion={c}
                habits={habits}
                entries={entries}
                today={today}
                onPress={() => onOpenHabit(c.habitId)}
              />
            ))}
          </View>
        )}
      </View>

      <ActionSheet
        visible={!!menuTask}
        title={menuTask?.title}
        onClose={() => setMenuTask(null)}
        items={menuTask ? [
          {
            label: 'Rename',
            icon: 'edit',
            onPress: () => startRename(menuTask),
          },
          {
            label: 'Delete',
            icon: 'delete-outline',
            destructive: true,
            onPress: () => removeTask(projectId, m.id, menuTask.id).catch(errorAlert),
          },
        ] : []}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  box: {
    backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface2,
    padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  titleMet: { color: colors.textMuted },
  due: { color: colors.textDim, fontSize: font.sm },
  body: { marginLeft: 34, borderTopWidth: 1, borderTopColor: colors.surface2, paddingTop: spacing.xs },
  // Same background as the box so a dragged row covers what's under it without looking like a box.
  task: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    paddingVertical: spacing.sm, backgroundColor: colors.surface,
  },
  // While dragged: a box with the same padding on all sides (the row already has
  // spacing.sm top/bottom); the negative margin keeps the content where it was.
  taskDragging: {
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, marginHorizontal: -spacing.sm,
  },
  handle: { width: HANDLE_W, height: ROW, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  handleIcon: { marginVertical: -(HANDLE_ICON - ROW) / 2, marginHorizontal: -(HANDLE_ICON - HANDLE_W) / 2 },
  // Fixed ROW×ROW slot for the tickbox / "+" so titles and the add field start at the same x.
  slot: { width: ROW, height: ROW, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  slotIcon: { margin: -ICON_INSET },
  taskName: { flex: 1 },
  // Line box exactly ROW tall with no Android font padding, so its top meets the tickbox's top.
  taskText: {
    flex: 1, color: colors.text, fontSize: TITLE_SIZE, lineHeight: TITLE_LINE, marginTop: TITLE_SHIFT,
    includeFontPadding: false, textAlignVertical: 'top',
  },
  taskEdit: { padding: 0, margin: 0 },
  taskDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  addRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  addInput: {
    flex: 1, color: colors.text, fontSize: TITLE_SIZE, lineHeight: TITLE_LINE, marginTop: TITLE_SHIFT,
    padding: 0, margin: 0, includeFontPadding: false, textAlignVertical: 'top',
  },
  addBtn: { fontSize: font.sm, fontWeight: '600' },
  targets: { borderTopWidth: 1, borderTopColor: colors.surface2, marginTop: spacing.xs, paddingTop: spacing.xs },
});
