import { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Image, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useExercises } from '../../store/gymStore';
import { ExerciseFormModal, uploadExerciseImage } from './ExerciseFormModal';
import { colors, spacing, font, radius } from '../../theme';
import {
  type Exercise, type ExerciseType,
  STRENGTH_GROUPS, exerciseType, exerciseMuscleGroup,
} from '../../types/gym';

export function ExercisesTab() {
  const { user } = useAuth();
  const { exercises, add, update } = useExercises(user?.uid);
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [typeFilter, setTypeFilter] = useState<ExerciseType | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  function toggleFilter(t: ExerciseType) {
    setTypeFilter((prev) => (prev === t ? null : t));
  }

  const filtered = typeFilter ? exercises.filter((e) => exerciseType(e) === typeFilter) : exercises;

  type Section = { title: string; type: ExerciseType; data: Exercise[] };
  const sections: Section[] = [];

  if (!typeFilter || typeFilter === 'strength') {
    STRENGTH_GROUPS.forEach((g) => {
      const data = filtered.filter((e) => exerciseType(e) === 'strength' && exerciseMuscleGroup(e) === g);
      if (data.length) sections.push({ title: g, type: 'strength', data });
    });
  }

  if (!typeFilter || typeFilter === 'cardio') {
    const cardio = filtered.filter((e) => exerciseType(e) === 'cardio');
    if (cardio.length) sections.push({ title: 'Cardio', type: 'cardio', data: cardio });
  }

  function metaLine(ex: Exercise): string {
    if (exerciseType(ex) === 'strength') {
      return `${ex.series ?? 3} × ${ex.repsMin ?? 8}–${ex.repsMax ?? 10}`;
    }
    return `${ex.durationMin ?? 30} min`;
  }

  const cardGap = spacing.md;
  const hPad = spacing.lg;
  const cardWidth = (width - hPad * 2 - cardGap) / 2;

  async function handleAddSave(data: Omit<Exercise, 'id' | 'createdAt'>, pendingImageUri?: string | null) {
    const uid = user?.uid;
    const id = await add(data);
    if (pendingImageUri && uid) {
      const imageUri = await uploadExerciseImage(uid, id, pendingImageUri);
      await update(id, { imageUri });
    }
    setAddModalOpen(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.chips}>
          <Pressable
            style={[styles.chip, typeFilter === 'strength' && styles.chipActive]}
            onPress={() => toggleFilter('strength')}
          >
            <MaterialIcons name="fitness-center" size={14} color={typeFilter === 'strength' ? '#fff' : colors.textMuted} />
            <Text style={[styles.chipText, typeFilter === 'strength' && styles.chipTextActive]}>Strength</Text>
          </Pressable>
          <Pressable
            style={[styles.chip, typeFilter === 'cardio' && styles.chipActive]}
            onPress={() => toggleFilter('cardio')}
          >
            <MaterialIcons name="directions-run" size={14} color={typeFilter === 'cardio' ? '#fff' : colors.textMuted} />
            <Text style={[styles.chipText, typeFilter === 'cardio' && styles.chipTextActive]}>Cardio</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => setAddModalOpen(true)} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {exercises.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="fitness-center" size={48} color={colors.textDim} />
          <Text style={styles.emptyText}>No exercises yet.{'\n'}Add your first one.</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="filter-list" size={48} color={colors.textDim} />
          <Text style={styles.emptyText}>No exercises in this category.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: hPad }]}>
          {sections.map((section) => (
            <View key={`${section.type}-${section.title}`} style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons
                  name={section.type === 'strength' ? 'fitness-center' : 'directions-run'}
                  size={13}
                  color={colors.accent}
                />
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionCount}>{section.data.length}</Text>
              </View>

              {chunk(section.data, 2).map((row, rowIndex) => (
                <View key={rowIndex} style={[styles.gridRow, { gap: cardGap }]}>
                  {row.map((item) => (
                    <Pressable
                      key={item.id}
                      style={[styles.card, { width: cardWidth }]}
                      onPress={() => router.push(`/fitness/exercise/${item.id}`)}
                    >
                      {item.imageUri ? (
                        <Image source={{ uri: item.imageUri }} style={[styles.cardImage, { width: cardWidth, height: cardWidth }]} />
                      ) : (
                        <View style={[styles.cardImagePlaceholder, { width: cardWidth, height: cardWidth }]}>
                          <MaterialIcons
                            name={exerciseType(item) === 'strength' ? 'fitness-center' : 'directions-run'}
                            size={32}
                            color={colors.textMuted}
                          />
                        </View>
                      )}
                      <View style={styles.cardBody}>
                        <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
                        <Text style={styles.cardMeta}>{metaLine(item)}</Text>
                      </View>
                    </Pressable>
                  ))}
                  {row.length === 1 && <View style={{ width: cardWidth }} />}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <ExerciseFormModal
        userId={user?.uid ?? ''}
        exercise={undefined}
        visible={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSave={handleAddSave}
      />
    </View>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

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
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  addBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  scrollContent: { paddingVertical: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionCount: { color: colors.textDim, fontSize: font.sm },
  gridRow: { flexDirection: 'row', marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    overflow: 'hidden',
  },
  cardImage: { resizeMode: 'cover' },
  cardImagePlaceholder: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: spacing.sm, gap: 2 },
  cardName: { color: colors.text, fontSize: font.sm, fontWeight: '700', lineHeight: 17 },
  cardMeta: { color: colors.textDim, fontSize: font.sm },
});
