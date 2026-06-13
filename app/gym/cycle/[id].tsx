import { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { useCycles, useModules } from '../../../src/store/gymStore';
import { Modal } from '../../../src/components/ui/Modal';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { colors, spacing, font, radius } from '../../../src/theme';

export default function CycleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { cycles, update } = useCycles(user!.uid);
  const { modules } = useModules(user!.uid);

  const cycle = cycles.find((c) => c.id === id);
  const [addModal, setAddModal] = useState(false);
  const [editNameModal, setEditNameModal] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [nameForm, setNameForm] = useState({ name: '', description: '' });

  if (!cycle) return null;

  const available = modules.filter((m) => !cycle.moduleIds.includes(m.id));

  async function addModule() {
    if (!selectedModuleId) return;
    await update(cycle!.id, { moduleIds: [...cycle!.moduleIds, selectedModuleId] });
    setAddModal(false);
  }

  async function removeModule(mid: string) {
    Alert.alert('Remove Module', 'Remove this module from the cycle?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => update(cycle!.id, { moduleIds: cycle!.moduleIds.filter((x) => x !== mid) }) },
    ]);
  }

  async function moveUp(index: number) {
    const ids = [...cycle!.moduleIds];
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    await update(cycle!.id, { moduleIds: ids });
  }

  async function moveDown(index: number) {
    const ids = [...cycle!.moduleIds];
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    await update(cycle!.id, { moduleIds: ids });
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{cycle.name}</Text>
          {cycle.description ? <Text style={styles.headerSub}>{cycle.description}</Text> : null}
        </View>
        <Pressable onPress={() => { setNameForm({ name: cycle.name, description: cycle.description ?? '' }); setEditNameModal(true); }}>
          <Text style={styles.editBtn}>Edit</Text>
        </Pressable>
      </View>

      <FlatList
        data={cycle.moduleIds}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyText}>No modules in this cycle yet.</Text>
          </View>
        }
        ListFooterComponent={
          available.length > 0 ? (
            <Pressable onPress={() => { setSelectedModuleId(available[0].id); setAddModal(true); }} style={styles.addRow}>
              <Text style={styles.addRowText}>+ Add Module</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item: mid, index }) => {
          const mod = modules.find((m) => m.id === mid);
          return (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <Text style={styles.dayLabel}>Day {index + 1}</Text>
                <Text style={styles.cardName}>{mod?.name ?? 'Deleted module'}</Text>
                {mod && <Text style={styles.cardMeta}>{mod.executions.length} exercise{mod.executions.length !== 1 ? 's' : ''}</Text>}
              </View>
              <View style={styles.cardActions}>
                <View style={styles.arrows}>
                  <Pressable onPress={() => moveUp(index)} disabled={index === 0} hitSlop={8}>
                    <Text style={[styles.arrow, index === 0 && styles.arrowDisabled]}>↑</Text>
                  </Pressable>
                  <Pressable onPress={() => moveDown(index)} disabled={index === cycle.moduleIds.length - 1} hitSlop={8}>
                    <Text style={[styles.arrow, index === cycle.moduleIds.length - 1 && styles.arrowDisabled]}>↓</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => removeModule(mid)} hitSlop={8}>
                  <Text style={styles.actionDelete}>Remove</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <Modal title="Add Module" visible={addModal} onClose={() => setAddModal(false)}>
        <View style={styles.form}>
          <Text style={styles.formLabel}>Select Module</Text>
          <View style={styles.moduleList}>
            {available.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => setSelectedModuleId(m.id)}
                style={[styles.moduleChip, selectedModuleId === m.id && styles.moduleChipActive]}
              >
                <Text style={[styles.moduleChipText, selectedModuleId === m.id && styles.moduleChipTextActive]}>{m.name}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row2}>
            <Button label="Cancel" onPress={() => setAddModal(false)} style={styles.flex1} />
            <Button label="Add" variant="primary" onPress={addModule} disabled={!selectedModuleId} style={styles.flex1} />
          </View>
        </View>
      </Modal>

      <Modal title="Edit Cycle" visible={editNameModal} onClose={() => setEditNameModal(false)}>
        <View style={styles.form}>
          <Input label="Name" value={nameForm.name} onChangeText={(v) => setNameForm({ ...nameForm, name: v })} autoFocus />
          <Input label="Description (optional)" value={nameForm.description} onChangeText={(v) => setNameForm({ ...nameForm, description: v })} />
          <View style={styles.row2}>
            <Button label="Cancel" onPress={() => setEditNameModal(false)} style={styles.flex1} />
            <Button label="Save" variant="primary" onPress={async () => { await update(cycle!.id, { name: nameForm.name.trim(), description: nameForm.description.trim() || undefined }); setEditNameModal(false); }} disabled={!nameForm.name.trim()} style={styles.flex1} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  back: { marginRight: spacing.md },
  backText: { color: colors.accent, fontSize: font.md },
  headerCenter: { flex: 1 },
  headerTitle: { color: colors.text, fontSize: font.lg, fontWeight: '600' },
  headerSub: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  editBtn: { color: colors.accent, fontSize: font.sm },
  list: { padding: spacing.lg },
  empty: { padding: spacing.xxl, alignItems: 'center', gap: spacing.md },
  emptyIcon: { fontSize: 40 },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.lg,
  },
  cardLeft: { flex: 1 },
  dayLabel: { color: colors.textDim, fontSize: font.sm, marginBottom: 2 },
  cardName: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  cardMeta: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  arrows: { flexDirection: 'column', gap: 4 },
  arrow: { color: colors.textMuted, fontSize: font.lg, textAlign: 'center' },
  arrowDisabled: { opacity: 0.3 },
  actionDelete: { color: colors.danger, fontSize: font.sm },
  addRow: {
    marginTop: spacing.md,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addRowText: { color: colors.textMuted, fontSize: font.md },
  form: { gap: spacing.lg },
  formLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  moduleList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  moduleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  moduleChipActive: { borderColor: colors.accent, backgroundColor: `${colors.accent}22` },
  moduleChipText: { color: colors.textMuted, fontSize: font.sm },
  moduleChipTextActive: { color: colors.accent },
  row2: { flexDirection: 'row', gap: spacing.md },
  flex1: { flex: 1 },
});
