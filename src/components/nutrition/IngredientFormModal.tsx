import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { getStorage, ref as storageRef, putFile, getDownloadURL } from '@react-native-firebase/storage';
import { getApp } from '@react-native-firebase/app';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { colors, spacing, font, radius } from '../../theme';
import type { Ingredient } from '../../types/nutrition';
import { NUTRIENT_COLORS, NUTRIENT_ICONS } from '../../types/nutrition';

export async function uploadIngredientImage(userId: string, ingredientId: string, localUri: string): Promise<string> {
  const fileRef = storageRef(getStorage(getApp()), `users/${userId}/ingredients/${ingredientId}.jpg`);
  await putFile(fileRef, localUri);
  return getDownloadURL(fileRef);
}

interface FormState {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fibre: string;
}

const EMPTY_FORM: FormState = { name: '', calories: '', protein: '', carbs: '', fat: '', fibre: '' };

interface Props {
  visible: boolean;
  onClose: () => void;
  ingredient?: Ingredient;
  onSave: (data: Omit<Ingredient, 'id' | 'createdAt'>, pendingImageUri?: string | null) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export function IngredientFormModal({ visible, onClose, ingredient, onSave, onDelete }: Props) {
  function makeForm(i?: Ingredient): FormState {
    if (!i) return EMPTY_FORM;
    return {
      name: i.name,
      calories: String(i.caloriesPer100g),
      protein: String(i.proteinPer100g),
      carbs: String(i.carbsPer100g),
      fat: String(i.fatPer100g),
      fibre: String(i.fibrePer100g),
    };
  }

  const [form, setForm] = useState<FormState>(() => makeForm(ingredient));
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setForm(makeForm(ingredient));
    setPendingImage(null);
  }, [visible, ingredient]);

  const currentImageUri = pendingImage ?? ingredient?.imageUrl;

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
    });
    if (!result.canceled) setPendingImage(result.assets[0].uri);
  }

  async function save() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const data: Omit<Ingredient, 'id' | 'createdAt'> = {
        name: form.name.trim(),
        imageUrl: ingredient?.imageUrl,
        caloriesPer100g: parseFloat(form.calories) || 0,
        proteinPer100g: parseFloat(form.protein) || 0,
        carbsPer100g: parseFloat(form.carbs) || 0,
        fatPer100g: parseFloat(form.fat) || 0,
        fibrePer100g: parseFloat(form.fibre) || 0,
      };
      await onSave(data, pendingImage);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save ingredient.');
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!ingredient || !onDelete) return;
    Alert.alert('Delete Ingredient', `Are you sure you want to delete "${ingredient.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await onDelete(ingredient.id); onClose(); } },
    ]);
  }

  return (
    <Modal title={ingredient ? 'Edit Ingredient' : 'Add Ingredient'} visible={visible} onClose={onClose}>
      <View style={styles.form}>
        <Pressable style={styles.imagePicker} onPress={pickImage} disabled={saving}>
          {currentImageUri ? (
            <Image source={{ uri: currentImageUri }} style={styles.imagePreview} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <MaterialIcons name="add-a-photo" size={26} color={colors.textMuted} />
            </View>
          )}
        </Pressable>
        <Text style={styles.imageHint}>Tap to add photo</Text>

        <Input label="Ingredient Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. Chicken Breast" />

        <Text style={styles.sectionLabel}>Nutritional values per 100g</Text>

        <Input
          label="Calories (kcal)" value={form.calories} onChangeText={(v) => setForm({ ...form, calories: v })}
          keyboardType="decimal-pad"
        />
        <Input label="Fat (g)" value={form.fat} onChangeText={(v) => setForm({ ...form, fat: v })} keyboardType="decimal-pad" />
        <Input label="Carbohydrates (g)" value={form.carbs} onChangeText={(v) => setForm({ ...form, carbs: v })} keyboardType="decimal-pad" />
        <Input label="Fibre (g)" value={form.fibre} onChangeText={(v) => setForm({ ...form, fibre: v })} keyboardType="decimal-pad" />
        <Input label="Protein (g)" value={form.protein} onChangeText={(v) => setForm({ ...form, protein: v })} keyboardType="decimal-pad" />

        <View style={styles.actions}>
          {ingredient && onDelete && <Button label="Delete" variant="danger" onPress={del} disabled={saving} style={styles.flex1} />}
          <Button label="Cancel" onPress={onClose} disabled={saving} style={styles.flex1} />
          <View style={styles.flex1}>
            <Button label={saving ? '' : 'Save'} variant="primary" onPress={save} disabled={!form.name.trim() || saving} />
            {saving && <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} pointerEvents="none" />}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function nutrientBadge(key: keyof typeof NUTRIENT_COLORS, value: number) {
  return { color: NUTRIENT_COLORS[key], icon: NUTRIENT_ICONS[key], value: Math.round(value) };
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  imagePicker: { alignSelf: 'center', width: 90, height: 90, borderRadius: radius.lg },
  imagePreview: { width: 90, height: 90, borderRadius: radius.lg },
  imagePlaceholder: {
    width: 90, height: 90, borderRadius: radius.lg,
    backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  imageHint: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  sectionLabel: { color: colors.text, fontSize: font.sm, fontWeight: '700', marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  flex1: { flex: 1 },
});
