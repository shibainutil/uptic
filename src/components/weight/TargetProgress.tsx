import { useState } from 'react';
import { View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { colors, spacing } from '../../theme';
import { diffDays, fromISO } from '../../lib/schedule';

export type TargetProjection =
  | { kind: 'reached' }
  | { kind: 'projected'; date: string }
  | { kind: 'never' };

function formatShortDate(iso: string): string {
  const d = fromISO(iso);
  const month = d.toLocaleDateString(undefined, { month: 'short' });
  return `${d.getDate()} ${month} ${d.getFullYear()}`;
}

const LABEL_WIDTH = 100;

/** A label pinned to a point on the track: centred on it, but kept inside the track's width
 * (aligned to the edge it would otherwise spill over). */
function PinnedLabel({ pct, width, children }: { pct: number; width: number; children: React.ReactNode }) {
  const x = (pct / 100) * width;
  const left = Math.min(Math.max(x - LABEL_WIDTH / 2, 0), Math.max(width - LABEL_WIDTH, 0));
  const align = left === 0 && x < LABEL_WIDTH / 2 ? 'flex-start'
    : left === width - LABEL_WIDTH && x > width - LABEL_WIDTH / 2 ? 'flex-end'
    : 'center';
  return <View style={[st.pinned, { left, alignItems: align }]}>{children}</View>;
}

/** Visual prognosis: a timeline from today with the goal date pinned above its marker and the
 * projected reach date pinned below its marker, so each date sits right at its spot on the
 * line and the two can never collide. The bar fills up to the projected date, green when
 * that's on or before the goal date and red when it's after. */
export function TargetProgress({ today, goalDate, projection, onTrack, goalColor }: {
  today: string;
  goalDate?: string;
  projection: TargetProjection;
  onTrack: boolean;
  goalColor: string;
}) {
  const [width, setWidth] = useState(0);
  const statusColor = onTrack ? colors.success : colors.danger;
  const projectedDate = projection.kind === 'projected' ? projection.date : null;
  const endDate = [goalDate, projectedDate]
    .filter((d): d is string => !!d && d > today)
    .reduce<string | null>((a, b) => (a == null || b > a ? b : a), null);
  const span = endDate ? diffDays(endDate, today) : 0;
  const pct = (iso: string) => (span > 0 ? Math.min(100, Math.max(0, (diffDays(iso, today) / span) * 100)) : 0);

  // Where the projection sits on the track: its date, or the far end when it's already reached
  // or won't happen at this rate.
  const projPct = projectedDate ? pct(projectedDate) : 100;
  const fillPct = projection.kind === 'never' && !goalDate ? 0 : projPct;
  const goalPct = goalDate ? pct(goalDate) : null;

  const projectedText = projection.kind === 'reached' ? 'Reached'
    : projectedDate ? formatShortDate(projectedDate)
    : 'Not at this rate';
  return (
    <View style={st.row}>
      <Text style={st.today}>Today</Text>
      <View style={st.timeline} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        <View style={st.labelRow}>
          {goalDate && goalPct != null && width > 0 && (
            <PinnedLabel pct={goalPct} width={width}>
              <Text style={[st.value, { color: goalColor }]}>{formatShortDate(goalDate)}</Text>
            </PinnedLabel>
          )}
        </View>

        <View style={st.track}>
          {fillPct > 0 && <View style={[st.fill, { width: `${fillPct}%`, backgroundColor: statusColor }]} />}
          {projection.kind !== 'never' && (
            <View style={[st.projDot, { left: `${projPct}%`, backgroundColor: statusColor }]} />
          )}
          {goalPct != null && <View style={[st.goalTick, { left: `${goalPct}%`, backgroundColor: goalColor }]} />}
        </View>

        <View style={st.labelRow}>
          {width > 0 && (
            <PinnedLabel pct={projPct} width={width}>
              <Text style={[st.value, { color: statusColor }]}>{projectedText}</Text>
            </PinnedLabel>
          )}
        </View>
      </View>
    </View>
  );
}

const TRACK = 6;
const DOT = 12;
const LABEL_ROW = 20;

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  today: { color: colors.textDim, fontSize: 10, fontWeight: '600' },
  timeline: { flex: 1 },
  labelRow: { height: LABEL_ROW, justifyContent: 'center' },
  pinned: { position: 'absolute', width: LABEL_WIDTH, top: 0, bottom: 0, justifyContent: 'center' },
  value: { fontSize: 12, fontWeight: '700' },
  track: {
    height: TRACK,
    borderRadius: TRACK / 2,
    backgroundColor: colors.surface2,
    marginVertical: (DOT - TRACK) / 2 + 2,
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: TRACK / 2, opacity: 0.55 },
  projDot: {
    position: 'absolute',
    top: (TRACK - DOT) / 2,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    marginLeft: -DOT / 2,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  goalTick: { position: 'absolute', top: -5, width: 2, height: TRACK + 10, marginLeft: -1, borderRadius: 1 },
});
