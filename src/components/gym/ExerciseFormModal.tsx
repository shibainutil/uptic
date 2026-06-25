import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Alert, Image, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { getStorage, ref as storageRef, putFile, getDownloadURL } from '@react-native-firebase/storage';
import { getApp } from '@react-native-firebase/app';
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

export async function uploadExerciseImage(userId: string, exerciseId: string, localUri: string): Promise<string> {
  const fileRef = storageRef(getStorage(getApp()), `users/${userId}/exercises/${exerciseId}.jpg`);
  await putFile(fileRef, localUri);
  return getDownloadURL(fileRef);
}

interface Props {
  userId: string;
  exercise?: Exercise;
  visible: boolean;
  onClose: () => void;
  onSave: (data: Omit<Exercise, 'id' | 'createdAt'>, pendingImageUri?: string | null, removeImage?: boolean) => Promise<void>;
}

export function ExerciseFormModal({ exercise, visible, onClose, onSave }: Props) {
  function makeForm(ex?: Exercise): FormState {
    if (!ex) return EMPTY_FORM;
    return {
      name: ex.name,
      type: exerciseType(ex),
      muscleGroup: exerciseMuscleGroup(ex),
      series: String(ex.series ?? 3),
      repsMin: String(ex.repsMin ?? 8),
      repsMax: String(ex.repsMax ?? 10),
      durationMin: String(ex.durationMin ?? 30),
      description: ex.description ?? '',
      params: (ex.params ?? []).map((p) => ({ ...p })),
    };
  }

  const [form, setForm] = useState<FormState>(() => makeForm(exercise));
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleClose() {
    if (saving) return;
    setForm(makeForm(exercise));
    setPendingImage(null);
    setRemoveImage(false);
    onClose();
  }

  const currentImageUri = removeImage ? undefined : (pendingImage ?? exercise?.imageUri);

  async function takePhoto() {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera unavailable', 'Camera access is off. You can still choose a photo from your library.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
      if (!result.canceled) { setPendingImage(result.assets[0].uri); setRemoveImage(false); }
    } catch {
      Alert.alert('Camera unavailable', 'The camera could not be opened. You can still choose a photo from your library.');
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
  function removeParamById(id: string) {
    setForm((f) => ({ ...f, params: f.params.filter((p) => p.id !== id) }));
  }

  async function save() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const cleanParams = form.params
        .filter((p) => p.name.trim())
        .map((p) => ({ id: p.id, name: p.name.trim(), unit: p.unit.trim(), required: p.required }));

      const data: Omit<Exercise, 'id' | 'createdAt'> = {
        name: form.name.trim(),
        type: form.type,
        params: cleanParams,
        description: form.description.trim() || undefined,
        ...(form.type === 'strength'
          ? {
              muscleGroup: form.muscleGroup,
              series: parseInt(form.series) || 3,
              repsMin: parseInt(form.repsMin) || 1,
              repsMax: parseInt(form.repsMax) || (parseInt(form.repsMin) || 1),
              durationMin: undefined,
            }
          : {
              durationMin: parseInt(form.durationMin) || 30,
              muscleGroup: undefined,
              series: undefined,
              repsMin: undefined,
              repsMax: undefined,
            }),
      };

      await onSave(data, pendingImage, removeImage);
      setForm(makeForm(exercise));
      setPendingImage(null);
      setRemoveImage(false);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save exercise. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={exercise ? 'Edit Exercise' : 'Add Exercise'} visible={visible} onClose={handleClose}>
      <View style={styles.form}>
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

        <Input label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. Bench Press" />

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

        <View style={styles.formField}>
          <Text style={styles.formLabel}>Parameters</Text>
          {form.params.length === 0 && (
            <Text style={styles.paramHint}>Optional custom fields recorded per execution (e.g. Weight · kg).</Text>
          )}
          {form.params.map((p) => (
            <View key={p.id} style={styles.paramRow}>
              <View style={styles.paramName}><Input value={p.name} onChangeText={(v) => updateParam(p.id, { name: v })} placeholder="Name" /></View>
              <View style={styles.paramUnit}><Input value={p.unit} onChangeText={(v) => updateParam(p.id, { unit: v })} placeholder="Unit" /></View>
              <View style={styles.paramReq}>
                <Toggle value={p.required} onChange={(v) => updateParam(p.id, { required: v })} />
                <Text style={styles.paramReqLabel}>Req</Text>
              </View>
              <Pressable onPress={() => removeParamById(p.id)} hitSlop={8} style={styles.paramDelete}>
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
          <Button label="Cancel" onPress={handleClose} style={styles.flex1} disabled={saving} />
          <View style={styles.flex1}>
            <Button label={saving ? '' : 'Save'} variant="primary" onPress={save} disabled={!form.name.trim() || saving} />
            {saving && <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} pointerEvents="none" />}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  formField: { gap: spacing.xs },
  formLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
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
    width: 120, height: 120, borderRadius: radius.lg,
    backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
  },
  imageHint: { color: colors.textMuted, fontSize: font.sm },
  imageEditBadge: {
    position: 'absolute', bottom: -6, right: -6,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.surface,
  },
});
