import { View, Text, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { usePillars } from '../../src/store/pillarStore';
import { useGoals } from '../../src/store/goalStore';
import { SUGGESTED_PILLARS } from '../../src/types/pillars';
import { Button } from '../../src/components/ui/Button';
import { colors, spacing, font, radius } from '../../src/theme';

export default function PillarsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { pillars, loaded, addMany, move, remove } = usePillars(user?.uid);
  const { goals } = useGoals(user?.uid);
  const goalCount = (pillarId: string) => goals.filter((g) => g.pillarId === pillarId).length;

  function confirmDelete(id: string, name: string) {
    const count = goalCount(id);
    if (count > 0) {
      Alert.alert(
        'Pillar has goals',
        `"${name}" still has ${count} goal${count !== 1 ? 's' : ''}. Move or delete ${count !== 1 ? 'them' : 'it'} first.`,
      );
      return;
    }
    Alert.alert('Delete Pillar', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(id) },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.count}>{pillars.length} pillar{pillars.length !== 1 ? 's' : ''}</Text>
        <Pressable onPress={() => router.push('/pillars/new')} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {loaded && pillars.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="account-balance" size={48} color={colors.textDim} />
          <Text style={styles.emptyTitle}>No pillars yet</Text>
          <Text style={styles.emptyText}>
            Pillars are the big areas of your life.{'\n'}Every goal will belong to one.
          </Text>
          <View style={styles.suggestions}>
            {SUGGESTED_PILLARS.map((p) => (
              <View key={p.name} style={[styles.suggestion, { backgroundColor: `${p.color}22` }]}>
                <MaterialIcons name={p.icon} size={14} color={p.color} />
                <Text style={[styles.suggestionText, { color: p.color }]}>{p.name}</Text>
              </View>
            ))}
          </View>
          <Button label="Start with these five" variant="primary" onPress={() => addMany(SUGGESTED_PILLARS)} />
          <Pressable onPress={() => router.push('/pillars/new')} hitSlop={8}>
            <Text style={styles.link}>or create your own</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={pillars}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item, index }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/pillars/${item.id}`)}>
              <View style={[styles.iconWrap, { backgroundColor: `${item.color}22` }]}>
                <MaterialIcons name={item.icon} size={22} color={item.color} />
              </View>
              <View style={styles.cardMain}>
                <Text style={styles.cardName}>{item.name}</Text>
                {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
                <Text style={styles.cardGoals}>
                  {goalCount(item.id) || 'No'} goal{goalCount(item.id) !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.cardActions}>
                <View style={styles.reorder}>
                  <Pressable onPress={() => move(item.id, -1)} disabled={index === 0} hitSlop={6}>
                    <MaterialIcons name="keyboard-arrow-up" size={20} color={index === 0 ? colors.textDim : colors.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => move(item.id, 1)} disabled={index === pillars.length - 1} hitSlop={6}>
                    <MaterialIcons name="keyboard-arrow-down" size={20} color={index === pillars.length - 1 ? colors.textDim : colors.textMuted} />
                  </Pressable>
                </View>
                <Pressable onPress={() => confirmDelete(item.id, item.name)} hitSlop={8}>
                  <Text style={styles.actionDelete}>Delete</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: font.lg, fontWeight: '600' },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 4 },
  suggestionText: { fontSize: font.sm, fontWeight: '600' },
  link: { color: colors.accent, fontSize: font.sm },
  list: { padding: spacing.lg },
  sep: { height: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardMain: { flex: 1, gap: 2 },
  cardName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  cardDesc: { color: colors.textDim, fontSize: font.sm },
  cardGoals: { color: colors.textMuted, fontSize: font.sm },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reorder: { alignItems: 'center' },
  actionDelete: { color: colors.danger, fontSize: font.sm },
});
