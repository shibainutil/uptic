import { useState } from 'react';
import { View, Text, Pressable, Image, FlatList, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { IngredientFormModal, uploadIngredientImage } from './IngredientFormModal';
import { NutrientBadgeRow } from './NutrientBadgeRow';
import { colors, spacing, font, radius } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useIngredients } from '../../store/nutritionStore';
import type { Ingredient } from '../../types/nutrition';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function IngredientsLibrary({ visible, onClose }: Props) {
  const { user } = useAuth();
  const { ingredients, loaded, add, update, remove } = useIngredients(user?.uid);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | undefined>(undefined);

  const filtered = query
    ? ingredients.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
    : ingredients;
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

  function openAdd() { setEditing(undefined); setFormOpen(true); }
  function openEdit(i: Ingredient) { setEditing(i); setFormOpen(true); }

  async function save(data: Omit<Ingredient, 'id' | 'createdAt'>, pendingImageUri?: string | null) {
    if (editing) {
      let imageUrl = data.imageUrl;
      if (pendingImageUri) imageUrl = await uploadIngredientImage(user!.uid, editing.id, pendingImageUri);
      await update(editing.id, { ...data, imageUrl });
    } else {
      const id = await add(data);
      if (pendingImageUri) {
        const imageUrl = await uploadIngredientImage(user!.uid, id, pendingImageUri);
        await update(id, { imageUrl });
      }
    }
    setFormOpen(false);
  }

  return (
    <Modal title="Ingredients" visible={visible} onClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.searchRow}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search ingredients..."
            style={styles.searchInput}
          />
          <Pressable style={styles.addBtn} onPress={openAdd}>
            <MaterialIcons name="add" size={20} color="#fff" />
          </Pressable>
        </View>

        {loaded && sorted.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="restaurant" size={40} color={colors.textDim} />
            <Text style={styles.emptyText}>{query ? `No ingredients match "${query}"` : 'No ingredients yet'}</Text>
            {!query && (
              <Pressable onPress={openAdd}><Text style={styles.emptyAction}>Add your first ingredient</Text></Pressable>
            )}
          </View>
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={(i) => i.id}
            style={styles.list}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => openEdit(item)}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.rowImage} />
                ) : (
                  <View style={styles.rowImagePlaceholder}>
                    <MaterialIcons name="restaurant" size={20} color={colors.textDim} />
                  </View>
                )}
                <View style={styles.rowContent}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                  <NutrientBadgeRow values={{
                    calories: item.caloriesPer100g, fat: item.fatPer100g, carbs: item.carbsPer100g,
                    fibre: item.fibrePer100g, protein: item.proteinPer100g,
                  }}
                  />
                </View>
              </Pressable>
            )}
          />
        )}

        <IngredientFormModal
          visible={formOpen}
          onClose={() => setFormOpen(false)}
          ingredient={editing}
          onSave={save}
          onDelete={remove}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, minHeight: 300 },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchInput: { flex: 1 },
  addBtn: {
    width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  list: { maxHeight: 420 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { color: colors.textMuted, fontSize: font.md },
  emptyAction: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    padding: spacing.sm, marginBottom: spacing.sm,
  },
  rowImage: { width: 44, height: 44, borderRadius: radius.sm },
  rowImagePlaceholder: {
    width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  rowContent: { flex: 1, gap: 4 },
  rowName: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
});
