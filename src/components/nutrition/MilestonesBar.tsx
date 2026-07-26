import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, font, spacing, radius } from '../../theme';
import type { FastingSession, NutritionSettings } from '../../types/nutrition';
import type { Milestones } from '../../lib/fasting';
import { actualFastingHours, todayISO } from '../../lib/fasting';

const RED = '#E53935';
const DEEP_ORANGE = '#D84315';
const ORANGE = '#FB8C00';
const AMBER = '#FFB300';

interface NodeSpec {
  key: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
  label: string;
  time?: string;
  achieved: boolean;
  failed: boolean;
}

function relativeDay(iso: string, dateISO: string): string {
  const d = iso.slice(0, 10);
  if (d === dateISO) return '';
  const diff = (new Date(d).getTime() - new Date(dateISO).getTime()) / 86_400_000;
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Node({ spec, dateISO, editable, onPress }: { spec: NodeSpec; dateISO: string; editable: boolean; onPress?: () => void }) {
  const color = spec.failed ? colors.danger : spec.achieved ? spec.color : colors.textDim;
  const bg = spec.failed ? `${colors.danger}26` : spec.achieved ? `${spec.color}26` : colors.surface2;
  return (
    <Pressable style={styles.node} onPress={editable ? onPress : undefined} disabled={!editable}>
      <View style={[styles.circle, { backgroundColor: bg, borderColor: color }]}>
        <MaterialIcons name={spec.failed ? 'close' : spec.icon} size={16} color={color} />
      </View>
      <Text style={[styles.nodeLabel, spec.achieved && { color: spec.color }]}>{spec.label}</Text>
      {spec.time && <Text style={styles.nodeTime}>{new Date(spec.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text>}
      {spec.time && <Text style={styles.nodeDate}>{relativeDay(spec.time, dateISO)}</Text>}
    </Pressable>
  );
}

function Bar({ fromColor, toColor, fraction }: { fromColor: string; toColor: string; fraction: number }) {
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, backgroundColor: toColor }]} />
    </View>
  );
}

interface Props {
  session: FastingSession;
  settings: NutritionSettings;
  milestones: Milestones;
  dateISO: string;
  onEditStart: () => void;
  onEditMilestone: (key: 'fatBurn' | 'dailyGoal' | 'bonusGoal') => void;
}

export function MilestonesBar({ session, settings, milestones, dateISO, onEditStart, onEditMilestone }: Props) {
  const editable = dateISO === todayISO();
  const hours = actualFastingHours(session, dateISO);

  const started: NodeSpec = { key: 'started', icon: 'play-arrow', color: RED, label: 'Started', time: session.startTime, achieved: true, failed: false };
  const fatBurn: NodeSpec = { key: 'fatBurn', icon: 'local-fire-department', color: DEEP_ORANGE, label: 'Fat Burn', time: milestones.fatBurn.time, achieved: milestones.fatBurn.achieved, failed: milestones.fatBurn.failed };
  const dailyGoal: NodeSpec = { key: 'dailyGoal', icon: 'flag', color: ORANGE, label: 'Goal', time: milestones.dailyGoal.time, achieved: milestones.dailyGoal.achieved, failed: milestones.dailyGoal.failed };
  const bonusGoal: NodeSpec = { key: 'bonusGoal', icon: 'star', color: AMBER, label: 'Bonus', time: milestones.bonusGoal.time, achieved: milestones.bonusGoal.achieved, failed: milestones.bonusGoal.failed };

  function fraction(fromHours: number, toHours: number) {
    return (hours - fromHours) / Math.max(toHours - fromHours, 0.0001);
  }

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <MaterialIcons name="timeline" size={16} color={colors.text} />
        <Text style={styles.title}>Fasting Milestones</Text>
      </View>
      <View style={styles.row}>
        <Node spec={started} dateISO={dateISO} editable={editable} onPress={onEditStart} />
        <Bar fromColor={RED} toColor={DEEP_ORANGE} fraction={milestones.fatBurn.failed ? 0 : fraction(0, settings.fatBurnHours)} />
        <Node spec={fatBurn} dateISO={dateISO} editable={editable} onPress={() => onEditMilestone('fatBurn')} />
        <Bar fromColor={DEEP_ORANGE} toColor={ORANGE} fraction={milestones.dailyGoal.failed ? 0 : fraction(settings.fatBurnHours, settings.dailyFastingGoalHours)} />
        <Node spec={dailyGoal} dateISO={dateISO} editable={editable} onPress={() => onEditMilestone('dailyGoal')} />
        <Bar fromColor={ORANGE} toColor={AMBER} fraction={milestones.bonusGoal.failed ? 0 : fraction(settings.dailyFastingGoalHours, settings.bonusFastingGoalHours)} />
        <Node spec={bonusGoal} dateISO={dateISO} editable={editable} onPress={() => onEditMilestone('bonusGoal')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.surface2,
    padding: spacing.md, gap: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center' },
  node: { alignItems: 'center', width: 52, gap: 2 },
  circle: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  nodeLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  nodeTime: { fontSize: 9, color: colors.textDim },
  nodeDate: { fontSize: 8, color: colors.textDim },
  barTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surface2, marginHorizontal: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
});
