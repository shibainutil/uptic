import { useState } from 'react';
import {
  View, Text, Pressable, SectionList, StyleSheet, Alert, Image, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { auth } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useExercises } from '../../store/gymStore';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Picker } from '../ui/Picker';
import { colors, spacing, font, radius } from '../../theme';
import type { Exercise } from '../../types/gym';

const CATEGORIES = ['Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Legs', 'Cardio', 'Other'];

const CATEGORY_EMOJI: Record<string, string> = {
  Chest:     '🏋️',
  Back:      '🔄',
  Shoulders: '🤸',
  Arms:      '💪',
  Core:      '⚡',
  Legs:      '🦵',
  Cardio:    '❤️',
  Other:     '⚙️',
};

const EMPTY_FORM = { name: '', category: 'Other', description: '' };

// Firebase Storage web SDK creates Blobs internally, which Hermes doesn't support.
// Bypass the SDK entirely — upload via XHR to the REST API instead.
async function uploadExerciseImage(userId: string, exerciseId: string, base64: string): Promise<string> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');

  const bucket = 'uptic-6ff6b.firebasestorage.app';
  const path = `users/${userId}/exercises/${exerciseId}.jpg`;
  const encodedPath = encodeURIComponent(path);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}`;

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const json = await new Promise<{ downloadTokens: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'image/jpeg');
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(bytes);
  });

  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${json.downloadTokens}`;
}

export function ExercisesTab() {
  const { user } = useAuth();
  const { exercises, add, update, remove } = useExercises(user?.uid);

  const [modal, setModal] = useState<'add' | Exercise | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pendingImage, setPendingImage] = useState<{ uri: string; base64: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setForm(EMPTY_FORM);
    setPendingImage(null);
    setModal('add');
  }

  function openEdit(ex: Exercise) {
    setForm({ name: ex.name, category: ex.category, description: ex.description ?? '' });
    setPendingImage(null);
    setModal(ex);
  }

  function closeModal() {
    if (saving) return;
    setModal(null);
    setPendingImage(null);
  }

  async function pickImage() {
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
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setPendingImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
    }
  }

  async function save() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const uid = user?.uid;
      if (modal === 'add') {
        const id = await add({
          name: form.name.trim(),
          category: form.category,
          description: form.description.trim() || undefined,
        });
        if (pendingImage && uid) {
          const imageUri = await uploadExerciseImage(uid, id, pendingImage.base64);
          await update(id, { imageUri });
        }
      } else if (modal && typeof modal === 'object') {
        const updateData: Partial<Exercise> = {
          name: form.name.trim(),
          category: form.category,
          description: form.description.trim() || undefined,
        };
        if (pendingImage && uid) {
          updateData.imageUri = await uploadExerciseImage(uid, modal.id, pendingImage.base64);
        }
        await update(modal.id, updateData);
      }
      setModal(null);
      setPendingImage(null);
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

  const sections = CATEGORIES
    .map((cat) => ({ title: cat, data: exercises.filter((e) => e.category === cat) }))
    .filter((s) => s.data.length > 0);

  const currentImageUri =
    pendingImage?.uri ??
    (modal && typeof modal === 'object' ? modal.imageUri : undefined);

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
          <Text style={styles.emptyIcon}>🏋️</Text>
          <Text style={styles.emptyText}>No exercises yet.{'\n'}Add your first one.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <Text style={styles.sectionEmoji}>{CATEGORY_EMOJI[section.title] ?? '💪'}</Text>
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.row}>
              {item.imageUri ? (
                <Image source={{ uri: item.imageUri }} style={styles.rowThumb} />
              ) : (
                <View style={[styles.rowThumb, styles.rowThumbPlaceholder]}>
                  <Text style={{ fontSize: 22 }}>{CATEGORY_EMOJI[item.category] ?? '💪'}</Text>
                </View>
              )}
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{item.name}</Text>
                {item.description ? <Text style={styles.rowDesc}>{item.description}</Text> : null}
              </View>
              <View style={styles.rowActions}>
                <Pressable onPress={() => openEdit(item)} hitSlop={8}>
                  <Text style={styles.actionEdit}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(item)} hitSlop={8}>
                  <Text style={styles.actionDelete}>Delete</Text>
                </Pressable>
              </View>
            </View>
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
          {/* Image picker */}
          <Pressable style={styles.imagePicker} onPress={pickImage} disabled={saving}>
            {currentImageUri ? (
              <Image source={{ uri: currentImageUri }} style={styles.imagePreview} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={styles.imageIcon}>📷</Text>
                <Text style={styles.imageHint}>Add photo</Text>
              </View>
            )}
            <View style={styles.imageEditBadge}>
              <Text style={styles.imageEditBadgeText}>{currentImageUri ? '✎' : '+'}</Text>
            </View>
          </Pressable>

          <Input
            label="Name"
            value={form.name}
            onChangeText={(v) => setForm({ ...form, name: v })}
            placeholder="e.g. Bench Press"
            autoFocus
          />
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Category</Text>
            <Picker options={CATEGORIES} value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
          </View>
          <Input
            label="Description (optional)"
            value={form.description}
            onChangeText={(v) => setForm({ ...form, description: v })}
            placeholder="Notes about this exercise"
          />
          <View style={styles.formRow}>
            <Button label="Cancel" onPress={closeModal} style={styles.flex1} disabled={saving} />
            <Button
              label={saving ? '' : 'Save'}
              variant="primary"
              onPress={save}
              disabled={!form.name.trim() || saving}
              style={styles.flex1}
            />
            {saving && (
              <ActivityIndicator
                color="#fff"
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            )}
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
  emptyIcon: { fontSize: 48 },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  list: { padding: spacing.lg, gap: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionEmoji: { fontSize: 20 },
  sectionTitle: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionCount: { color: colors.textDim, fontSize: font.sm },
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
  rowThumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm,
  },
  rowThumbPlaceholder: {
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: { flex: 1 },
  rowName: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  rowDesc: { color: colors.textDim, fontSize: font.sm, marginTop: 2 },
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
  imagePicker: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: radius.lg,
    overflow: 'visible',
  },
  imagePreview: {
    width: 120,
    height: 120,
    borderRadius: radius.lg,
  },
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
  imageIcon: { fontSize: 32 },
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
  imageEditBadgeText: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 18 },
});
