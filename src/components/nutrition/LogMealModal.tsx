import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { DatePicker } from '../ui/DatePicker';
import { TimeField, timeParts, combineDateTime } from './FastingDialogs';
import { NutrientBadgeRow } from './NutrientBadgeRow';
import { colors, spacing, font, radius } from '../../theme';
import { toISO, fromISO } from '../../lib/schedule';
import type { Ingredient, MealIngredient, NutritionData, NutritionSettings } from '../../types/nutrition';
import { mealIngredientFromIngredient, sumMacros, NUTRIENT_COLORS, NUTRIENT_ICONS, NUTRIENT_LABELS } from '../../types/nutrition';

interface Props {
  visible: boolean;
  onClose: () => void;
  entry?: NutritionData;
  defaultDate: string; // ISO yyyy-mm-dd, used for new entries
  ingredients: Ingredient[];
  settings: NutritionSettings;
  otherEntriesSameDay: (date: string, excludeId?: string) => NutritionData[];
  onSave: (data: Omit<NutritionData, 'id' | 'createdAt'>) => Promise<unknown>;
  onDelete?: (id: string) => Promise<unknown>;
}

function sittingId(iso: string) { return iso; }

export function LogMealModal({
  visible, onClose, entry, defaultDate, ingredients, settings, otherEntriesSameDay, onSave, onDelete,
}: Props) {
  const [sittings, setSittings] = useState<string[]>([]);
  const [selected, setSelected] = useState<MealIngredient[]>([]);
  const [query, setQuery] = useState('');
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (entry) {
      setSittings(entry.mealSittings.length ? entry.mealSittings : [entry.timestamp]);
      setSelected(entry.ingredients ?? []);
    } else {
      setSittings([new Date(`${defaultDate}T${new Date().toTimeString().slice(0, 8)}`).toISOString()]);
      setSelected([]);
    }
    setQuery('');
    setAddingFor(null);
  }, [visible, entry, defaultDate]);

  const dateISO = sittings.length ? toISO(new Date(sittings[0])) : defaultDate;

  function setDate(newDateISO: string) {
    setSittings((prev) => prev.map((s) => {
      const p = timeParts(s);
      return combineDateTime(newDateISO, p.h, p.m);
    }));
  }

  function setSittingTime(index: number, h: string, m: string) {
    setSittings((prev) => prev.map((s, i) => (i === index ? combineDateTime(toISO(new Date(s)), h, m) : s)));
  }

  function addSitting() {
    const last = sittings[sittings.length - 1];
    const now = new Date();
    const newIso = combineDateTime(toISO(new Date(last)), String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'));
    setSittings((prev) => [...prev, newIso]);
  }

  function removeSitting(index: number) {
    setSittings((prev) => prev.filter((_, i) => i !== index));
  }

  const filteredIngredients = query
    ? ingredients.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
    : [];

  function isSelected(ingredientId: string) {
    return selected.some((s) => s.ingredientId === ingredientId);
  }

  function startAdd(ingredientId: string, existingAmount?: number) {
    setAddingFor(ingredientId);
    setAmountDraft(existingAmount != null ? String(existingAmount) : '');
  }

  function commitAmount(ingredient: Ingredient) {
    const amount = parseFloat(amountDraft);
    if (!amount || amount <= 0) { setAddingFor(null); return; }
    const mi = mealIngredientFromIngredient(ingredient, amount);
    setSelected((prev) => {
      const exists = prev.some((s) => s.ingredientId === ingredient.id);
      return exists ? prev.map((s) => (s.ingredientId === ingredient.id ? mi : s)) : [...prev, mi];
    });
    setAddingFor(null);
    setQuery('');
  }

  function removeIngredient(ingredientId: string) {
    setSelected((prev) => prev.filter((s) => s.ingredientId !== ingredientId));
  }

  const totals = sumMacros([{ id: '', date: '', calories: selected.reduce((a, s) => a + s.calories, 0), protein: selected.reduce((a, s) => a + s.protein, 0), carbs: selected.reduce((a, s) => a + s.carbs, 0), fat: selected.reduce((a, s) => a + s.fat, 0), fibre: selected.reduce((a, s) => a + s.fibre, 0), goalMet: false, timestamp: '', mealSittings: [], ingredients: [], createdAt: '' }]);

  const otherToday = otherEntriesSameDay(dateISO, entry?.id);
  const otherTotals = sumMacros(otherToday);
  const dayTotals = {
    calories: otherTotals.calories + totals.calories,
    protein: otherTotals.protein + totals.protein,
    carbs: otherTotals.carbs + totals.carbs,
    fat: otherTotals.fat + totals.fat,
    fibre: otherTotals.fibre + totals.fibre,
  };

  const TARGET_FIELDS: Record<keyof typeof NUTRIENT_COLORS, { min: keyof NutritionSettings; max: keyof NutritionSettings }> = {
    calories: { min: 'dailyCalorieMin', max: 'dailyCalorieMax' },
    protein: { min: 'dailyProteinMin', max: 'dailyProteinMax' },
    carbs: { min: 'dailyCarbsMin', max: 'dailyCarbsMax' },
    fat: { min: 'dailyFatMin', max: 'dailyFatMax' },
    fibre: { min: 'dailyFibreMin', max: 'dailyFibreMax' },
  };

  function dayStatusColor(key: keyof typeof NUTRIENT_COLORS): string {
    const min = settings[TARGET_FIELDS[key].min] as number | undefined;
    const max = settings[TARGET_FIELDS[key].max] as number | undefined;
    const v = dayTotals[key];
    if (min == null || max == null) return colors.textMuted;
    if (v < min) return '#FB8C00';
    if (v > max) return colors.danger;
    return colors.success;
  }

  async function save() {
    if (!selected.length || saving) return;
    setSaving(true);
    try {
      const sortedSittings = [...sittings].sort();
      const data: Omit<NutritionData, 'id' | 'createdAt'> = {
        date: toISO(new Date(sortedSittings[0])),
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein),
        carbs: Math.round(totals.carbs),
        fat: Math.round(totals.fat),
        fibre: Math.round(totals.fibre),
        goalMet: totals.calories >= settings.dailyCalorieGoal,
        timestamp: sortedSittings[0],
        mealSittings: sortedSittings,
        ingredients: selected,
      };
      await onSave(data);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!entry || !onDelete) return;
    Alert.alert('Delete Meal', 'Are you sure you want to delete this entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await onDelete(entry.id); onClose(); } },
    ]);
  }

  return (
    <Modal title="Log Meal" visible={visible} onClose={onClose}>
      <View style={styles.form}>
        <Text style={styles.sectionLabel}>Date &amp; Time</Text>
        <DatePicker label="Date" value={dateISO} onChange={setDate} />

        {sittings.map((s, i) => {
          const p = timeParts(s);
          return (
            <View key={sittingId(s) + i} style={styles.sittingRow}>
              <View style={styles.flex1}>
                <TimeField
                  label={sittings.length > 1 ? `Sitting ${i + 1}` : 'Time'}
                  hour={p.h} minute={p.m}
                  onHour={(v) => setSittingTime(i, v, p.m)}
                  onMinute={(v) => setSittingTime(i, p.h, v)}
                />
              </View>
              {i === sittings.length - 1 ? (
                <Pressable onPress={addSitting} hitSlop={8}>
                  <MaterialIcons name="add-circle" size={30} color={colors.accent} />
                </Pressable>
              ) : (
                <Pressable onPress={() => removeSitting(i)} hitSlop={8}>
                  <MaterialIcons name="remove-circle" size={30} color={colors.danger} />
                </Pressable>
              )}
            </View>
          );
        })}

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>Ingredients</Text>

        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search ingredients..."
        />

        {query.length > 0 && (
          <View style={styles.searchResults}>
            {filteredIngredients.length === 0 ? (
              <Text style={styles.noResults}>No ingredients found</Text>
            ) : filteredIngredients.map((ing) => {
              const already = selected.find((s) => s.ingredientId === ing.id);
              const editingThis = addingFor === ing.id;
              return (
                <View key={ing.id} style={styles.searchRow}>
                  {ing.imageUrl ? (
                    <Image source={{ uri: ing.imageUrl }} style={styles.thumb} />
                  ) : (
                    <View style={styles.thumbPlaceholder}><MaterialIcons name="restaurant" size={18} color={colors.textDim} /></View>
                  )}
                  <View style={styles.searchInfo}>
                    <Text style={styles.searchName} numberOfLines={1}>{ing.name}</Text>
                    <NutrientBadgeRow values={{
                      calories: ing.caloriesPer100g, fat: ing.fatPer100g, carbs: ing.carbsPer100g,
                      fibre: ing.fibrePer100g, protein: ing.proteinPer100g,
                    }}
                    />
                  </View>
                  {editingThis ? (
                    <Input
                      value={amountDraft}
                      onChangeText={setAmountDraft}
                      keyboardType="decimal-pad"
                      autoFocus
                      onSubmitEditing={() => commitAmount(ing)}
                      onBlur={() => commitAmount(ing)}
                      style={styles.amountInput}
                    />
                  ) : (
                    <Pressable onPress={() => startAdd(ing.id, already?.amountInGrams)} style={styles.amountBox}>
                      <Text style={styles.amountBoxText}>{already ? `${already.amountInGrams}g` : '+ add'}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {selected.length === 0 ? (
          <View style={styles.emptySelected}>
            <MaterialIcons name="restaurant" size={30} color={colors.textDim} />
            <Text style={styles.emptySelectedText}>No ingredients added</Text>
            <Text style={styles.emptySelectedHint}>Search above to add ingredients</Text>
          </View>
        ) : (
          <View style={styles.selectedList}>
            {selected.map((s) => (
              <View key={s.ingredientId} style={styles.searchRow}>
                {s.imageUrl ? (
                  <Image source={{ uri: s.imageUrl }} style={styles.thumb} />
                ) : (
                  <View style={styles.thumbPlaceholder}><MaterialIcons name="restaurant" size={18} color={colors.textDim} /></View>
                )}
                <View style={styles.searchInfo}>
                  <Text style={styles.searchName} numberOfLines={1}>{s.ingredientName}</Text>
                  <NutrientBadgeRow values={{ calories: s.calories, fat: s.fat, carbs: s.carbs, fibre: s.fibre, protein: s.protein }} />
                </View>
                {addingFor === s.ingredientId ? (
                  <Input
                    value={amountDraft}
                    onChangeText={setAmountDraft}
                    keyboardType="decimal-pad"
                    autoFocus
                    onSubmitEditing={() => {
                      const ing = ingredients.find((i) => i.id === s.ingredientId);
                      if (ing) commitAmount(ing);
                    }}
                    style={styles.amountInput}
                  />
                ) : (
                  <Pressable onPress={() => startAdd(s.ingredientId, s.amountInGrams)} style={styles.amountBox}>
                    <Text style={styles.amountBoxText}>{s.amountInGrams}g</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => removeIngredient(s.ingredientId)} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {selected.length > 0 && (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>Daily Totals</Text>
            <View style={styles.macroGrid}>
              {(['calories', 'fat', 'carbs', 'protein', 'fibre'] as const).map((key) => (
                <View key={key} style={styles.macroCard}>
                  <MaterialIcons name={NUTRIENT_ICONS[key]} size={16} color={NUTRIENT_COLORS[key]} />
                  <Text style={styles.macroValue}>{Math.round(totals[key])}</Text>
                  <View style={[styles.macroDayBadge, { backgroundColor: `${dayStatusColor(key)}26` }]}>
                    <Text style={[styles.macroDayText, { color: dayStatusColor(key) }]}>{Math.round(dayTotals[key])}</Text>
                  </View>
                  <Text style={styles.macroLabel}>{NUTRIENT_LABELS[key]}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.actions}>
          {entry && onDelete && <Button label="Delete" variant="danger" onPress={del} disabled={saving} style={styles.flex1} />}
          <Button label="Cancel" onPress={onClose} disabled={saving} style={styles.flex1} />
          <View style={styles.flex1}>
            <Button label={saving ? '' : 'Save'} variant="primary" onPress={save} disabled={!selected.length || saving} />
            {saving && <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} pointerEvents="none" />}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  flex1: { flex: 1 },
  sectionLabel: { color: colors.text, fontSize: font.sm, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  sittingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  searchResults: {
    maxHeight: 220, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.xs, gap: spacing.xs,
  },
  noResults: { color: colors.textDim, fontSize: font.sm, textAlign: 'center', padding: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  thumb: { width: 40, height: 40, borderRadius: radius.sm },
  thumbPlaceholder: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  searchInfo: { flex: 1, gap: 3 },
  searchName: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
  amountBox: {
    borderWidth: 1, borderColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6,
  },
  amountBoxText: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
  amountInput: { width: 70 },
  emptySelected: { alignItems: 'center', gap: 4, paddingVertical: spacing.lg },
  emptySelectedText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  emptySelectedHint: { color: colors.textDim, fontSize: font.sm },
  selectedList: { gap: spacing.xs },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  macroCard: {
    flex: 1, minWidth: '18%', alignItems: 'center', gap: 3,
    backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm,
  },
  macroValue: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  macroDayBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.sm - 4 },
  macroDayText: { fontSize: 10, fontWeight: '700' },
  macroLabel: { color: colors.textDim, fontSize: 9 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
