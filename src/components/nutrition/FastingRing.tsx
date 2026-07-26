import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText, G } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, font, spacing } from '../../theme';
import type { FastingSession, NutritionData, NutritionSettings } from '../../types/nutrition';
import {
  isInEatingWindow, firstNutritionAfterFast, entriesAfterFastStart, hoursBetween,
  displayDuration, formatHMS, ringStatus, computeMilestones, todayISO,
} from '../../lib/fasting';
import { earliestSitting } from '../../types/nutrition';

const SIZE = 280;
const CENTER = SIZE / 2;
const RADIUS = CENTER - 20;
const STROKE = 15;
const BG_RING = colors.surface2;
const TICK_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

const RED = '#E53935';
const DEEP_ORANGE = '#D84315';
const ORANGE = '#FB8C00';
const AMBER = '#FFB300';
const BLUE = '#3B82F6';

function hourOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Angle in degrees, 0 = top (midnight), clockwise. */
function angleForHour(hour: number): number {
  return (hour / 24) * 360 - 90;
}

function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

function arcPath(startHour: number, endHour: number, r: number): string {
  let sweep = endHour - startHour;
  if (sweep <= 0) sweep += 24;
  if (sweep > 24) sweep = 24;
  const startAngle = angleForHour(startHour % 24);
  const endAngle = startAngle + (sweep / 24) * 360;
  const start = polar(startAngle, r);
  const end = polar(endAngle, r);
  const largeArc = sweep > 12 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

interface Segment { fromHour: number; toHour: number; color: string }

/** Builds the stacked fasting-arc color bands (red -> deepOrange -> orange -> amber),
 * clipped to however many hours have actually elapsed. */
function fastingSegments(startHour: number, elapsedHours: number, settings: NutritionSettings): Segment[] {
  const bounds = [0, 12, settings.dailyFastingGoalHours, settings.bonusFastingGoalHours, Math.max(elapsedHours, settings.bonusFastingGoalHours + 1)];
  const bandColors = [RED, DEEP_ORANGE, ORANGE, AMBER];
  const segs: Segment[] = [];
  for (let i = 0; i < bandColors.length; i++) {
    const from = bounds[i];
    const to = Math.min(bounds[i + 1], elapsedHours);
    if (to > from) segs.push({ fromHour: startHour + from, toHour: startHour + to, color: bandColors[i] });
  }
  return segs;
}

interface Props {
  session: FastingSession | null;
  settings: NutritionSettings;
  entries: NutritionData[];
  dateISO: string;
  isToday: boolean;
}

function MilestoneBadge({ hour, color }: { hour: number; color: string }) {
  const { x, y } = polar(angleForHour(((hour % 24) + 24) % 24), RADIUS);
  return (
    <G>
      <Circle cx={x} cy={y} r={9} fill={color} stroke={colors.surface} strokeWidth={2} />
    </G>
  );
}

export function FastingRing({ session, settings, entries, dateISO, isToday }: Props) {
  const hasFast = !!session;
  const startHour = hasFast ? hourOfDay(session.startTime) : 0;
  const inEatingWindow = isInEatingWindow(session, entries);
  const dur = hasFast ? displayDuration(session, entries, dateISO) : null;
  const status = hasFast ? ringStatus(session, settings, entries, dateISO, isToday) : null;
  const milestones = hasFast ? computeMilestones(session, settings, entries, dateISO) : null;

  const elapsedHours = hasFast
    ? Math.min(hoursBetween(new Date().toISOString(), session.startTime), 24)
    : 0;

  const segs = hasFast ? fastingSegments(startHour, Math.max(elapsedHours, 0), settings) : [];

  const first = hasFast ? firstNutritionAfterFast(session, entries) : null;
  const eatingStartHour = first ? hourOfDay(earliestSitting(first)) : null;
  const eatingElapsed = first ? Math.min(hoursBetween(new Date().toISOString(), earliestSitting(first)), 24) : 0;

  const afterFast = hasFast ? entriesAfterFastStart(session, entries) : [];

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={CENTER} cy={CENTER} r={RADIUS} stroke={BG_RING} strokeWidth={STROKE} fill="none" />

        {TICK_HOURS.map((h) => {
          const a = polar(angleForHour(h), RADIUS - STROKE / 2 - 2);
          const b = polar(angleForHour(h), RADIUS + STROKE / 2 + 2);
          return <Line key={h} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colors.border} strokeWidth={1} />;
        })}

        {segs.map((s, i) => (
          <Path key={i} d={arcPath(s.fromHour, s.toHour, RADIUS)} stroke={s.color} strokeWidth={STROKE} fill="none" strokeLinecap="round" />
        ))}

        {inEatingWindow && eatingStartHour != null && eatingElapsed > 0 && (
          <Path
            d={arcPath(eatingStartHour, eatingStartHour + eatingElapsed, RADIUS)}
            stroke={BLUE} strokeWidth={STROKE} fill="none" strokeLinecap="round"
          />
        )}

        {TICK_HOURS.map((h) => {
          const align = h === 0 || h === 12 ? 'middle' : h < 12 ? 'start' : 'end';
          const dx = h === 0 || h === 12 ? 0 : h < 12 ? 8 : -8;
          const p = polar(angleForHour(h), RADIUS - STROKE - 14);
          return (
            <SvgText key={h} x={p.x + dx} y={p.y + 4} fontSize={10} fontWeight="600" fill={colors.textMuted} textAnchor={align}>
              {`${h}:00`}
            </SvgText>
          );
        })}

        {hasFast && (
          <MilestoneBadge hour={startHour} color={RED} />
        )}
        {hasFast && milestones && !milestones.fatBurn.failed && (
          <MilestoneBadge hour={startHour + settings.fatBurnHours} color={DEEP_ORANGE} />
        )}
        {hasFast && milestones && !milestones.dailyGoal.failed && (
          <MilestoneBadge hour={startHour + settings.dailyFastingGoalHours} color={ORANGE} />
        )}
        {hasFast && milestones && !milestones.bonusGoal.failed && (
          <MilestoneBadge hour={startHour + settings.bonusFastingGoalHours} color={AMBER} />
        )}
        {afterFast.map((e) => (
          <MilestoneBadge key={e.id} hour={hourOfDay(earliestSitting(e))} color={BLUE} />
        ))}
      </Svg>

      <View style={styles.center} pointerEvents="none">
        {!hasFast ? (
          <>
            <MaterialIcons name="timer-off" size={56} color={colors.textDim} />
            <Text style={styles.centerHint}>Start your fast</Text>
          </>
        ) : inEatingWindow ? (
          <>
            <MaterialIcons name="restaurant" size={28} color={BLUE} />
            <Text style={[styles.centerTimer, { color: BLUE }]}>{formatHMS(dur!.ms)}</Text>
            <Text style={styles.centerHint}>in eating window</Text>
          </>
        ) : (
          <>
            <Text style={[styles.centerTimer, { color: status!.color }]}>{formatHMS(dur!.ms)}</Text>
            <Text style={styles.centerHint} numberOfLines={2}>{status!.text}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  center: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: spacing.xl,
  },
  centerTimer: { fontSize: 30, fontWeight: '700' },
  centerHint: { fontSize: font.sm, color: colors.textMuted, textAlign: 'center' },
});
