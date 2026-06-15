import { useState } from 'react';
import {
  View, Text, Pressable, SectionList, StyleSheet, Alert, Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { getStorage, ref as storageRef, putFile, getDownloadURL } from '@react-native-firebase/storage';
import { getApp } from '@react-native-firebase/app';
import { useAuth } from '../../context/AuthContext';
import { useExercises } from '../../store/gymStore';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Picker } from '../ui/Picker';
import { Segmented } from '../ui/Segmented';
import { Toggle } from '../ui/Toggle';
import { colors, spacing, font, radius } from '../../theme';
import {
  type Exercise, type ExerciseParam, type ExerciseType,
  STRENGTH_GROUPS, exerciseType, exerciseMuscleGroup,
} from '../../types/gym';

function paramId() {
  return Math.random().toString(36).slice(2);
}

interface FormState {
  name: string;
  type: ExerciseType;
  muscleGroup: string;
  series: string;
  repsMin: string;
  repsMax: string;
  durationMin: string;
  description: string;
  params: ExerciseParam[];
}

const EMPTY_FORM: FormState = {
  name: '', type: 'strength', muscleGroup: 'Other',
  series: '3', repsMin: '8', repsMax: '10', durationMin: '30',
  description: '', params: [],
};

async function uploadExerciseImage(userId: string, exerciseId: string, localUri: string): Promise<string> {
  const fileRef = storageRef(getStorage(getApp()), `users/${userId}/exercises/${exerciseId}.jpg`);
  await putFile(fileRef, localUri);
  return getDownloadURL(fileRef);
}

export function ExercisesTab() {
  const { user } = useAuth();
  const { exercises, add, update, remove } = useExercises(user?.uid);
  const router = useRouter();

  const [modal, setModal] = useState<'add' | Exercise | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setForm(EMPTY_FORM);
    setPendingImage(null);
    setRemoveImage(false);
    setModal('add');
  }

  function openEdit(ex: Exercise) {
    setForm({
      name: ex.name,
      type: exerciseType(ex),
      muscleGroup: exerciseMuscleGroup(ex),
      series: String(ex.series ?? 3),
      repsMin: String(ex.repsMin ?? 8),
      repsMax: String(ex.repsMax ?? 10),
      durationMin: String(ex.durationMin ?? 30),
      description: ex.description ?? '',
      params: (ex.params ?? []).map((p) => ({ ...p })),
    });
    setPendingImage(null);
    setRemoveImage(false);
    setModal(ex);
  }

  function closeModal() {
    if (saving) return;
    setModal(null);
    setPendingImage(null);
    setRemoveImage(false);
  }

  async function takePhoto() {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera unavailable',
          'Camera access is off. If you just updated the app, it may need a fresh build before the camera can be used. You can still choose a photo from your library.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
      if (!result.canceled) { setPendingImage(result.assets[0].uri); setRemoveImage(false); }
    } catch {
      Alert.alert(
        'Camera unavailable',
        'The camera could not be opened. This feature needs a new app build. You can still choose a photo from your library.',
      );
    }
  }

  async function chooseFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) { setPendingImage(result.assets[0].uri); setRemoveImage(false); }
  }

  const currentImageUri = removeImage
    ? undefined
    : (pendingImage ?? (modal && typeof modal === 'object' ? modal.imageUri : undefined));

  function onPhotoPress() {
    const opts: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: chooseFromLibrary },
    ];
    if (currentImageUri) {
      opts.push({ text: 'Remove Photo', style: 'destructive', onPress: () => { setRemoveImage(true); setPendingImage(null); } });
    }
    opts.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Exercise Photo', undefined, opts);
  }

  function addParam() {
    setForm((f) => ({ ...f, params: [...f.params, { id: paramId(), name: '', unit: '', required: false }] }));
  }
  function updateParam(id: string, patch: Partial<ExerciseParam>) {
    setForm((f) => ({ ...f, params: f.params.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }
  function removeParam(id: string) {
    setForm((f) => ({ ...f, params: f.params.filter((p) => p.id !== id) }));
  }

  async function save() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const uid = user?.uid;
      const cleanParams = form.params
        .filter((p) => p.name.trim())
        .map((p) => ({ id: p.id, name: p.name.trim(), unit: p.unit.trim(), required: p.required }));

      const base: Partial<Exercise> = {
        name: form.name.trim(),
        type: form.type,
        params: cleanParams,
        description: form.description.trim() || undefined,
      };
      if (form.type === 'strength') {
        base.muscleGroup = form.muscleGroup;
        base.series = parseInt(form.series) || 3;
        base.repsMin = parseInt(form.repsMin) || 1;
        base.repsMax = parseInt(form.repsMax) || base.repsMin;
        base.durationMin = undefined;
      } else {
        base.durationMin = parseInt(form.durationMin) || 30;
        base.muscleGroup = undefined;
        base.series = undefined;
        base.repsMin = undefined;
        base.repsMax = undefined;
      }

      if (modal === 'add') {
        const id = await add(base as Omit<Exercise, 'id' | 'createdAt'>);
        if (pendingImage && uid) {
          const imageUri = await uploadExerciseImage(uid, id, pendingImage);
          await update(id, { imageUri });
        }
      } else if (modal && typeof modal === 'object') {
        if (pendingImage && uid) {
          base.imageUri = await uploadExerciseImage(uid, modal.id, pendingImage);
        } else if (removeImage) {
          base.imageUri = '';
        }
        await update(modal.id, base);
      }
      closeModal();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save exercise. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(ex: Exercise) {
    Alert.alert('Delete Exercise', `Remove "${ex.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(ex.id) },
    ]);
  }

  // ── Two-level grouping: Type > muscle group (Notion-style) ────────────────
  type Section = { title: string; type: ExerciseType; showSubgroup: boolean; firstOfType: boolean; data: Exercise[] };
  const strength = exercises.filter((e) => exerciseType(e) === 'strength');
  const cardio = exercises.filter((e) => exerciseType(e) === 'cardio');
  const sections: Section[] = [];
  let firstStrength = true;
  STRENGTH_GROUPS.forEach((g) => {
    const data = strength.filter((e) => exerciseMuscleGroup(e) === g);
    if (data.length) {
      sections.push({ title: g, type: 'strength', showSubgroup: true, firstOfType: firstStrength, data });
      firstStrength = false;
    }
  });
  if (cardio.length) {
    sections.push({ title: 'Cardio', type: 'cardio', showSubgroup: false, firstOfType: true, data: cardio });
  }

  function metaLine(ex: Exercise): string {
    const parts: string[] = [];
    if (exerciseType(ex) === 'strength') {
      parts.push(`${ex.series ?? 3} × ${ex.repsMin ?? 8}–${ex.repsMax ?? 10}`);
    } else {
      parts.push(`${ex.durationMin ?? 30} min`);
    }
    const n = ex.params?.length ?? 0;
    if (n) parts.push(`${n} param${n !== 1 ? 's' : ''}`);
    return parts.join('  ·  ');
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.count}>{exercises.length} exercise{exercises.length !== 1 ? 's' : ''}</Text>
        <Pressable onPress={openAdd} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {exercises.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="fitness-center" size={48} color={colors.textDim} />
          <Text style={styles.emptyText}>No exercises yet.{'\n'}Add your first one.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View>
              {(section as Section).firstOfType && (
                <View style={styles.typeBanner}>
                  <MaterialIcons
                    name={(section as Section).type === 'strength' ? 'fitness-center' : 'directions-run'}
                    size={18}
                    color={colors.accent}
                  />
                  <Text style={styles.typeBannerText}>
                    {(section as Section).type === 'strength' ? 'Strength' : 'Cardio'}
                  </Text>
                </View>
              )}
              {(section as Section).showSubgroup && (
                <View style={styles.subHeader}>
                  <Text style={styles.subHeaderText}>{section.title}</Text>
                  <Text style={styles.subHeaderCount}>{section.data.length}</Text>
                </View>
              )}
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/fitness/exercise/${item.id}`)}>
              {item.imageUri ? (
                <Image source={{ uri: item.imageUri }} style={styles.rowThumb} />
              ) : (
                <View style={[styles.rowThumb, styles.rowThumbPlaceholder]}>
                  <MaterialIcons
                    name={exerciseType(item) === 'strength' ? 'fitness-center' : 'directions-run'}
                    size={22}
                    color={colors.textMuted}
                  />
                </View>
              )}
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>{metaLine(item)}</Text>
              </View>
              <View style={styles.rowActions}>
                <Pressable onPress={() => openEdit(item)} hitSlop={8}>
                  <Text style={styles.actionEdit}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(item)} hitSlop={8}>
                  <Text style={styles.actionDelete}>Delete</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}

      <Modal
        title={modal === 'add' ? 'Add Exercise' : 'Edit Exercise'}
        visible={modal !== null}
        onClose={closeModal}
      >
        <View style={styles.form}>
          {/* Photo */}
          <Pressable style={styles.imagePicker} onPress={onPhotoPress} disabled={saving}>
            {currentImageUri ? (
              <Image source={{ uri: currentImageUri }} style={styles.imagePreview} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <MaterialIcons name="add-a-photo" size={30} color={colors.textMuted} />
                <Text style={styles.imageHint}>Add photo</Text>
              </View>
            )}
            <View style={styles.imageEditBadge}>
              <MaterialIcons name={currentImageUri ? 'edit' : 'add'} size={14} color="#fff" />
            </View>
          </Pressable>

          <Input
            label="Name"
            value={form.name}
            onChangeText={(v) => setForm({ ...form, name: v })}
            placeholder="e.g. Bench Press"
          />

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Type</Text>
            <Segmented
              options={[{ value: 'strength', label: 'Strength' }, { value: 'cardio', label: 'Cardio' }]}
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v })}
            />
          </View>

          {form.type === 'strength' ? (
            <>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Muscle group</Text>
                <Picker options={STRENGTH_GROUPS} value={form.muscleGroup} onChange={(v) => setForm({ ...form, muscleGroup: v })} />
              </View>
              <View style={styles.row3}>
                <Input label="Series" value={form.series} onChangeText={(v) => setForm({ ...form, series: v })} keyboardType="numeric" style={styles.flex1} />
                <Input label="Reps min" value={form.repsMin} onChangeText={(v) => setForm({ ...form, repsMin: v })} keyboardType="numeric" style={styles.flex1} />
                <Input label="Reps max" value={form.repsMax} onChangeText={(v) => setForm({ ...form, repsMax: v })} keyboardType="numeric" style={styles.flex1} />
              </View>
            </>
          ) : (
            <Input label="Duration (minutes)" value={form.durationMin} onChangeText={(v) => setForm({ ...form, durationMin: v })} keyboardType="numeric" />
          )}

          {/* Custom parameters */}
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Parameters</Text>
            {form.params.length === 0 ? (
              <Text style={styles.paramHint}>Optional custom fields recorded per execution (e.g. Weight · kg).</Text>
            ) : null}
            {form.params.map((p) => (
              <View key={p.id} style={styles.paramRow}>
                <View style={styles.paramName}>
                  <Input value={p.name} onChangeText={(v) => updateParam(p.id, { name: v })} placeholder="Name" />
                </View>
                <View style={styles.paramUnit}>
                  <Input value={p.unit} onChangeText={(v) => updateParam(p.id, { unit: v })} placeholder="Unit" />
                </View>
                <View style={styles.paramReq}>
                  <Toggle value={p.required} onChange={(v) => updateParam(p.id, { required: v })} />
                  <Text style={styles.paramReqLabel}>Req</Text>
                </View>
                <Pressable onPress={() => removeParam(p.id)} hitSlop={8} style={styles.paramDelete}>
                  <MaterialIcons name="close" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={addParam} style={styles.addParamBtn}>
              <MaterialIcons name="add" size={16} color={colors.accent} />
              <Text style={styles.addParamText}>Add parameter</Text>
            </Pressable>
          </View>

          <Input
            label="Description (optional)"
            value={form.description}
            onChangeText={(v) => setForm({ ...form, description: v })}
            placeholder="Notes about this exercise"
          />

          <View style={styles.formRow}>
            <Button label="Cancel" onPress={closeModal} style={styles.flex1} disabled={saving} />
            <View style={styles.flex1}>
              <Button
                label={saving ? '' : 'Save'}
                variant="primary"
                onPress={save}
                disabled={!form.name.trim() || saving}
              />
              {saving && <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} pointerEvents="none" />}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const THUMB = 52;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  count: { color: colors.textMuted, fontSize: font.sm },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  addBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  list: { padding: spacing.lg, gap: spacing.sm },
  typeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  typeBannerText: {
    color: colors.text,
    fontSize: font.lg,
    fontWeight: '700',
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  subHeaderText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  subHeaderCount: { color: colors.textDim, fontSize: font.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  rowThumb: { width: THUMB, height: THUMB, borderRadius: radius.sm },
  rowThumbPlaceholder: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1 },
  rowName: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  rowMeta: { color: colors.textDim, fontSize: font.sm, marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: spacing.lg },
  actionEdit: { color: colors.accent, fontSize: font.sm },
  actionDelete: { color: colors.danger, fontSize: font.sm },
  sep: { height: 4 },
  form: { gap: spacing.lg },
  formField: { gap: spacing.xs },
  formLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  formRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex1: { flex: 1 },
  row3: { flexDirection: 'row', gap: spacing.md },
  paramHint: { color: colors.textDim, fontSize: font.sm, marginBottom: spacing.xs },
  paramRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginBottom: spacing.sm },
  paramName: { flex: 2 },
  paramUnit: { flex: 1 },
  paramReq: { alignItems: 'center', gap: 2 },
  paramReqLabel: { color: colors.textMuted, fontSize: 10 },
  paramDelete: { paddingBottom: 10 },
  addParamBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  addParamText: { color: colors.accent, fontSize: font.sm, fontWeight: '500' },
  imagePicker: { alignSelf: 'center', width: 120, height: 120, borderRadius: radius.lg },
  imagePreview: { width: 120, height: 120, borderRadius: radius.lg },
  imagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  imageHint: { color: colors.textMuted, fontSize: font.sm },
  imageEditBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
