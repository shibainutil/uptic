import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { usePillars } from '../../../src/store/pillarStore';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { PILLAR_COLORS, PILLAR_ICONS, type Pillar, type PillarIcon } from '../../../src/types/pillars';
import { colors, spacing, font, radius } from '../../../src/theme';

export default function PillarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { pillars, loaded, add, update } = usePillars(user?.uid);

  const isNew = id === 'new';
  const existing = isNew ? undefined : pillars.find((p) => p.id === id);

  // Wait for Firestore before mounting the form so initial state isn't empty defaults.
  if (!isNew && (!loaded || !existing)) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Header title="Pillar" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{loaded ? 'Pillar not found.' : 'Loading…'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <PillarForm
      key={existing?.id ?? 'new'}
      existing={existing}
      add={add}
      update={update}
    />
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 48 }} />
    </View>
  );
}

type PillarActions = Pick<ReturnType<typeof usePillars>, 'add' | 'update'>;

function PillarForm({
  existing, add, update,
}: { existing?: Pillar } & PillarActions) {
  const router = useRouter();
  const isNew = !existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [icon, setIcon] = useState<PillarIcon>(existing?.icon ?? PILLAR_ICONS[0]);
  const [color, setColor] = useState(existing?.color ?? PILLAR_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || saving) return;
    const data = { name: name.trim(), description: description.trim() || undefined, icon, color };
    setSaving(true);
    try {
      if (isNew) await add(data);
      else await update(existing!.id, data);
      router.back();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save pillar.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title={isNew ? 'New Pillar' : 'Edit Pillar'} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.preview}>
          <View style={[styles.previewIcon, { backgroundColor: `${color}22` }]}>
            <MaterialIcons name={icon} size={32} color={color} />
          </View>
          <Text style={[styles.previewName, { color }]}>{name.trim() || 'Pillar name'}</Text>
        </View>

        <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Health" />
        <Input
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="What this area of life means to you"
          multiline
        />

        <View style={styles.field}>
          <Text style={styles.label}>Colour</Text>
          <View style={styles.swatches}>
            {PILLAR_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
              >
                {color === c && <MaterialIcons name="check" size={18} color="#fff" />}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Icon</Text>
          <View style={styles.icons}>
            {PILLAR_ICONS.map((i) => {
              const active = icon === i;
              return (
                <Pressable
                  key={i}
                  onPress={() => setIcon(i)}
                  style={[styles.iconOption, active && { borderColor: color, backgroundColor: `${color}22` }]}
                >
                  <MaterialIcons name={i} size={22} color={active ? color : colors.textMuted} />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.formRow}>
          <Button label="Cancel" onPress={() => router.back()} style={styles.flex1} disabled={saving} />
          <Button
            label={isNew ? 'Create' : 'Save'}
            variant="primary"
            onPress={save}
            disabled={!name.trim() || saving}
            style={styles.flex1}
          />
        </View>

      </ScrollView>
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
  back: { width: 48 },
  backText: { color: colors.accent, fontSize: font.md },
  headerTitle: { flex: 1, color: colors.text, fontSize: font.lg, fontWeight: '600', textAlign: 'center' },
  body: { padding: spacing.lg, gap: spacing.lg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textDim, fontSize: font.md },
  preview: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  previewIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  previewName: { fontSize: font.xl, fontWeight: '700' },
  field: { gap: spacing.sm },
  label: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatchActive: { borderWidth: 2, borderColor: '#fff' },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  iconOption: {
    width: 44, height: 44, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  formRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex1: { flex: 1 },
});
