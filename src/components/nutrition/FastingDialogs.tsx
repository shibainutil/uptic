import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';
import { colors, spacing, font, radius } from '../../theme';
import { todayISO, toISO, fromISO } from '../../lib/schedule';
import type { NutritionData, NutritionSettings } from '../../types/nutrition';
import { earliestSitting } from '../../types/nutrition';

export function timeParts(iso: string): { h: string; m: string } {
  const d = new Date(iso);
  return { h: String(d.getHours()).padStart(2, '0'), m: String(d.getMinutes()).padStart(2, '0') };
}

export function combineDateTime(dateISO: string, h: string, m: string): string {
  const d = fromISO(dateISO);
  const hh = Math.min(23, Math.max(0, parseInt(h, 10) || 0));
  const mm = Math.min(59, Math.max(0, parseInt(m, 10) || 0));
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

export function TimeField({ label, hour, minute, onHour, onMinute }: {
  label?: string; hour: string; minute: string; onHour: (v: string) => void; onMinute: (v: string) => void;
}) {
  return (
    <View style={styles.timeField}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.timeRow}>
        <MaterialIcons name="schedule" size={18} color={colors.accent} />
        <Input value={hour} onChangeText={(v) => onHour(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" style={styles.timeInput} placeholder="HH" />
        <Text style={styles.timeColon}>:</Text>
        <Input value={minute} onChangeText={(v) => onMinute(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" style={styles.timeInput} placeholder="MM" />
      </View>
    </View>
  );
}

// ── Start Fast ───────────────────────────────────────────────────────────

interface StartFastProps {
  visible: boolean;
  onClose: () => void;
  lastMealTime?: string;
  onStart: (startTimeISO: string) => Promise<unknown>;
}

export function StartFastModal({ visible, onClose, lastMealTime, onStart }: StartFastProps) {
  const [date, setDate] = useState(todayISO());
  const [h, setH] = useState('00');
  const [m, setM] = useState('00');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const now = new Date();
    setDate(todayISO());
    setH(String(now.getHours()).padStart(2, '0'));
    setM(String(now.getMinutes()).padStart(2, '0'));
  }, [visible]);

  async function save() {
    const iso = combineDateTime(date, h, m);
    if (new Date(iso).getTime() > Date.now()) {
      Alert.alert('Invalid time', 'Start time cannot be in the future');
      return;
    }
    setSaving(true);
    try {
      await onStart(iso);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Start New Fasting Cycle" visible={visible} onClose={onClose}>
      <View style={styles.form}>
        {lastMealTime && (
          <View style={styles.infoBox}>
            <MaterialIcons name="info-outline" size={16} color={colors.accent} />
            <Text style={styles.infoText}>
              Last meal logged at {new Date(lastMealTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}
        <DatePicker label="Date" value={date} onChange={setDate} />
        <TimeField label="Time" hour={h} minute={m} onHour={setH} onMinute={setM} />
        <View style={styles.actions}>
          <Button label="Cancel" onPress={onClose} style={styles.flex1} disabled={saving} />
          <Button label="Start Cycle" variant="primary" onPress={save} style={styles.flex1} disabled={saving} />
        </View>
      </View>
    </Modal>
  );
}

// ── Edit start time ──────────────────────────────────────────────────────

interface EditStartTimeProps {
  visible: boolean;
  onClose: () => void;
  startTime: string;
  onSave: (startTimeISO: string) => Promise<unknown>;
}

export function EditStartTimeModal({ visible, onClose, startTime, onSave }: EditStartTimeProps) {
  const [date, setDate] = useState(todayISO());
  const [h, setH] = useState('00');
  const [m, setM] = useState('00');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDate(toISO(new Date(startTime)));
    const p = timeParts(startTime);
    setH(p.h); setM(p.m);
  }, [visible, startTime]);

  async function save() {
    const iso = combineDateTime(date, h, m);
    if (new Date(iso).getTime() > Date.now()) {
      Alert.alert('Invalid time', 'Start time cannot be in the future');
      return;
    }
    setSaving(true);
    try {
      await onSave(iso);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit Fast Start Time" visible={visible} onClose={onClose}>
      <View style={styles.form}>
        <DatePicker label="Date" value={date} onChange={setDate} />
        <TimeField label="Time" hour={h} minute={m} onHour={setH} onMinute={setM} />
        <View style={styles.actions}>
          <Button label="Cancel" onPress={onClose} style={styles.flex1} disabled={saving} />
          <Button label="Save" variant="primary" onPress={save} style={styles.flex1} disabled={saving} />
        </View>
      </View>
    </Modal>
  );
}

// ── Edit milestone hours ─────────────────────────────────────────────────

const MILESTONE_META = {
  fatBurn: { title: 'Fat Burn Goal', field: 'fatBurnHours' as const },
  dailyGoal: { title: 'Daily Fasting Goal', field: 'dailyFastingGoalHours' as const },
  bonusGoal: { title: 'Bonus Fasting Goal', field: 'bonusFastingGoalHours' as const },
};

interface EditMilestoneProps {
  visible: boolean;
  onClose: () => void;
  milestone: keyof typeof MILESTONE_META | null;
  settings: NutritionSettings;
  onSave: (patch: Partial<NutritionSettings>) => Promise<unknown>;
}

export function EditMilestoneModal({ visible, onClose, milestone, settings, onSave }: EditMilestoneProps) {
  const [hours, setHours] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !milestone) return;
    setHours(String(settings[MILESTONE_META[milestone].field]));
  }, [visible, milestone, settings]);

  if (!milestone) return null;

  async function save() {
    const value = parseInt(hours, 10);
    if (!Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    try {
      let patch: Partial<NutritionSettings>;
      if (milestone === 'fatBurn') {
        const goalDiff = settings.dailyFastingGoalHours - settings.fatBurnHours;
        const bonusDiff = settings.bonusFastingGoalHours - settings.dailyFastingGoalHours;
        const newGoal = value + goalDiff;
        patch = { fatBurnHours: value, dailyFastingGoalHours: newGoal, bonusFastingGoalHours: newGoal + bonusDiff };
      } else if (milestone === 'dailyGoal') {
        const bonusDiff = settings.bonusFastingGoalHours - settings.dailyFastingGoalHours;
        patch = { dailyFastingGoalHours: value, bonusFastingGoalHours: value + bonusDiff };
      } else {
        patch = { bonusFastingGoalHours: value };
      }
      await onSave(patch);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={MILESTONE_META[milestone].title} visible={visible} onClose={onClose}>
      <View style={styles.form}>
        <Input label="Hours" value={hours} onChangeText={(v) => setHours(v.replace(/\D/g, ''))} keyboardType="number-pad" />
        <View style={styles.actions}>
          <Button label="Cancel" onPress={onClose} style={styles.flex1} disabled={saving} />
          <Button label="Save" variant="primary" onPress={save} style={styles.flex1} disabled={saving} />
        </View>
      </View>
    </Modal>
  );
}

// ── Weekly fasting goals ─────────────────────────────────────────────────

interface FastingGoalsProps {
  visible: boolean;
  onClose: () => void;
  settings: NutritionSettings;
  onSave: (patch: Partial<NutritionSettings>) => Promise<unknown>;
}

export function FastingGoalsModal({ visible, onClose, settings, onSave }: FastingGoalsProps) {
  const [daily, setDaily] = useState('');
  const [bonus, setBonus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDaily(String(settings.dailyFastingGoalHours));
    setBonus(String(settings.bonusFastingGoalHours));
  }, [visible, settings]);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        dailyFastingGoalHours: parseInt(daily, 10) || settings.dailyFastingGoalHours,
        bonusFastingGoalHours: parseInt(bonus, 10) || settings.bonusFastingGoalHours,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Fasting Goals" visible={visible} onClose={onClose}>
      <View style={styles.form}>
        <Input label="Daily Goal (hours)" value={daily} onChangeText={(v) => setDaily(v.replace(/\D/g, ''))} keyboardType="number-pad" />
        <Input label="Bonus Goal (hours)" value={bonus} onChangeText={(v) => setBonus(v.replace(/\D/g, ''))} keyboardType="number-pad" />
        <View style={styles.actions}>
          <Button label="Cancel" onPress={onClose} style={styles.flex1} disabled={saving} />
          <Button label="Save" variant="primary" onPress={save} style={styles.flex1} disabled={saving} />
        </View>
      </View>
    </Modal>
  );
}

// ── Configure daily nutrition targets ────────────────────────────────────

interface TargetsProps {
  visible: boolean;
  onClose: () => void;
  settings: NutritionSettings;
  onSave: (patch: Partial<NutritionSettings>) => Promise<unknown>;
}

const TARGET_ROWS: { label: string; unit: string; min: keyof NutritionSettings; max: keyof NutritionSettings }[] = [
  { label: 'Calories', unit: 'kcal', min: 'dailyCalorieMin', max: 'dailyCalorieMax' },
  { label: 'Fat', unit: 'g', min: 'dailyFatMin', max: 'dailyFatMax' },
  { label: 'Carbs', unit: 'g', min: 'dailyCarbsMin', max: 'dailyCarbsMax' },
  { label: 'Fibre', unit: 'g', min: 'dailyFibreMin', max: 'dailyFibreMax' },
  { label: 'Protein', unit: 'g', min: 'dailyProteinMin', max: 'dailyProteinMax' },
];

export function NutritionTargetsModal({ visible, onClose, settings, onSave }: TargetsProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const v: Record<string, string> = {};
    for (const row of TARGET_ROWS) {
      v[row.min] = settings[row.min] != null ? String(settings[row.min]) : (row.min === 'dailyCalorieMin' ? String(settings.dailyCalorieGoal) : '');
      v[row.max] = settings[row.max] != null ? String(settings[row.max]) : '';
    }
    setValues(v);
  }, [visible, settings]);

  function set(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v.replace(/\D/g, '') }));
  }

  async function save() {
    setSaving(true);
    try {
      const patch: Partial<NutritionSettings> = {};
      for (const row of TARGET_ROWS) {
        const minVal = values[row.min] ? parseInt(values[row.min], 10) : undefined;
        const maxVal = values[row.max] ? parseInt(values[row.max], 10) : undefined;
        (patch as Record<string, number | undefined>)[row.min] = minVal;
        (patch as Record<string, number | undefined>)[row.max] = maxVal;
      }
      const calMin = values.dailyCalorieMin ? parseInt(values.dailyCalorieMin, 10) : undefined;
      patch.dailyCalorieGoal = calMin ?? settings.dailyCalorieGoal;
      await onSave(patch);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Configure Daily Targets" visible={visible} onClose={onClose}>
      <View style={styles.form}>
        {TARGET_ROWS.map((row) => (
          <View key={row.label} style={styles.targetRow}>
            <Text style={styles.targetRowLabel}>{row.label} ({row.unit})</Text>
            <View style={styles.targetInputs}>
              <Input value={values[row.min] ?? ''} onChangeText={(v) => set(row.min, v)} keyboardType="number-pad" placeholder="Min" style={styles.flex1} />
              <Text style={styles.dash}>–</Text>
              <Input value={values[row.max] ?? ''} onChangeText={(v) => set(row.max, v)} keyboardType="number-pad" placeholder="Max" style={styles.flex1} />
            </View>
          </View>
        ))}
        <View style={styles.actions}>
          <Button label="Cancel" onPress={onClose} style={styles.flex1} disabled={saving} />
          <Button label="Save" variant="primary" onPress={save} style={styles.flex1} disabled={saving} />
        </View>
      </View>
    </Modal>
  );
}

export function lastMealTimeFrom(entries: NutritionData[]): string | undefined {
  const sorted = entries.map(earliestSitting).sort();
  return sorted[sorted.length - 1];
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  flex1: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: `${colors.accent}1A`, borderWidth: 1, borderColor: colors.accent,
    borderRadius: radius.sm, padding: spacing.sm,
  },
  infoText: { color: colors.text, fontSize: font.sm, flex: 1 },
  fieldLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs,
  },
  timeField: {},
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timeInput: { width: 60, textAlign: 'center' },
  timeColon: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  targetRow: { gap: spacing.xs },
  targetRowLabel: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
  targetInputs: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dash: { color: colors.textMuted },
});
