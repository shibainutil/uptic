import { Fragment, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, LayoutChangeEvent, LayoutAnimation } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Polyline, Line, Circle, Text as SvgText } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { useWeightEntries, useWeightTarget } from '../../store/weightStore';
import { WeightEntryModal } from './WeightEntryModal';
import { WeightTargetModal } from './WeightTargetModal';
import { WeightDateFilterModal, type DateRange } from './WeightDateFilterModal';
import { WeightPointDetailModal } from './WeightPointDetailModal';
import { TargetProgress } from './TargetProgress';
import { LabeledBox } from '../ui/LabeledBox';
import { useBottomBarAction } from '../../store/bottomBarStore';
import { colors, spacing, font, radius } from '../../theme';
import { fromISO, toISO, diffDays, addDays, todayISO } from '../../lib/schedule';
import { fitWeightTrend } from '../../lib/weightTrend';
import { groupWeightPeriods, formatPeriodLabel, type PeriodMode, type WeightPeriod } from '../../lib/weightPeriods';
import { toKg, fromKg, formatDelta, deltaColor, type WeightEntry, type WeightUnit } from '../../types/weight';

const PLOT_HEIGHT = 220;
const PLOT_Y_PAD = 28;
// Y-axis labels are drawn inside the chart SVG, right-aligned at this x. The data starts just
// past them; the first rotated x-axis label (~43px of leftward overhang) tucks in underneath
// the y-axis labels instead of needing its own empty margin inside the plot.
const Y_AXIS_WIDTH = 34;
const GRID_LEFT = Y_AXIS_WIDTH + 4;
const PLOT_LEFT_PAD = GRID_LEFT + 8;
const PLOT_RIGHT_PAD = 12;
const XAXIS_HEIGHT = 44; // reserved below the plot for rotated tick labels
// Band above the plot holding the max/min/now/target value badges.
const BADGE_WIDTH = 46;
const BADGE_HEIGHT = 19;
const BADGE_BAND = 24;
const LEGEND_SHIFT = 12;
const BADGE_NAMES: Record<string, string> = { max: 'Max', min: 'Min', now: 'Current', goal: 'Target' };
const TOTAL_SVG_HEIGHT = PLOT_HEIGHT + XAXIS_HEIGHT;
const GRID_STEP = 5; // y-axis tick spacing, in the displayed unit
const DEFAULT_MAX = 100; // y-axis max fallback (displayed unit) when nothing is logged yet
const TARGET_COLOR = '#F59E0B';
const TARGET_ICON = '🎯';
const CHART_ICON = '📈';
const DOT_CYCLE = 6.1;
const REF_DASH = '4,4'; // regular dashes for the max/min/current/target reference lines
const REF_DASH_CYCLE = 8;
// Reference lines are fainter than the plotted weight line so the real data stays dominant.
const REF_OPACITY = 0.5;

function formatRowDate(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const PERIOD_MODES: { mode: PeriodMode; label: string }[] = [
  { mode: 'week', label: 'Weekly' },
  { mode: 'month', label: 'Monthly' },
];

function formatAxisDate(iso: string): string {
  const d = fromISO(iso);
  const month = d.toLocaleDateString(undefined, { month: 'short' });
  return `${d.getDate()} ${month} '${String(d.getFullYear()).slice(-2)}`;
}

function formatValue(kg: number, unit: WeightUnit): string {
  return fromKg(kg, unit).toFixed(1);
}

function subtractMonths(iso: string, months: number): string {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() - months, d.getDate()));
}

// Month steps for the x-axis ticks; the smallest one that keeps the count readable is used.
const MONTH_STEP_CANDIDATES = [1, 2, 3, 4, 6, 12, 24, 36, 60, 120];
const MAX_X_TICKS = 7;

/** X-axis ticks: the last day of each month within [startISO, endISO]. Over longer spans only
 * every n-th month end is kept, aligned to the calendar (e.g. quarter ends, year ends). */
function monthEndTicks(startISO: string, endISO: string): string[] {
  const start = fromISO(startISO);
  const end = fromISO(endISO);
  const all: { iso: string; monthIndex: number }[] = [];
  for (let y = start.getFullYear(), m = start.getMonth(); y * 12 + m <= end.getFullYear() * 12 + end.getMonth(); m++) {
    if (m === 12) { m = 0; y++; }
    const iso = toISO(new Date(y, m + 1, 0));
    if (iso >= startISO && iso <= endISO) all.push({ iso, monthIndex: y * 12 + m });
  }
  // Thinning counts back from the last month, so the axis's final month end is always a tick.
  const lastIndex = all.length ? all[all.length - 1].monthIndex : 0;
  const keep = (t: { monthIndex: number }, k: number) => (lastIndex - t.monthIndex) % k === 0;
  const step = MONTH_STEP_CANDIDATES.find((k) => all.filter((t) => keep(t, k)).length <= MAX_X_TICKS)
    ?? MONTH_STEP_CANDIDATES[MONTH_STEP_CANDIDATES.length - 1];
  return all.filter((t) => keep(t, step)).map((t) => t.iso);
}

function formatXTickLabel(iso: string): string {
  const d = fromISO(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  return `${dd} ${mmm} ${d.getFullYear()}`;
}

type TargetProjection =
  | { kind: 'reached' }
  | { kind: 'projected'; date: string }
  | { kind: 'never' };

/** Projects when the target would be hit at the current weekly rate. This is the single
 * source of truth for "when will I reach my target" — both the chart's projection line/
 * marker and the target card's badge/comment use this same result, so the date never
 * disagrees between the two. */
function projectTargetDate(currentKg: number | null, targetKg: number | null, weeklyRateKg: number | null): TargetProjection {
  if (currentKg == null || targetKg == null) return { kind: 'never' };
  if (Math.abs(targetKg - currentKg) < 0.05) return { kind: 'reached' };
  if (weeklyRateKg == null || Math.abs(weeklyRateKg) < 1e-6) return { kind: 'never' };
  const daysNeeded = ((targetKg - currentKg) / weeklyRateKg) * 7;
  if (daysNeeded <= 0) return { kind: 'never' };
  return { kind: 'projected', date: addDays(todayISO(), Math.round(daysNeeded)) };
}

/** Whether the trend is on pace to hit the target. With a deadline set, this compares the
 * projected reach date against it; without one, it falls back to the simple "losing weight" rule. */
function isOnTrack(projection: TargetProjection, byDate: string | undefined, weeklyRateKg: number | null): boolean {
  if (projection.kind === 'reached') return true;
  if (byDate) {
    return projection.kind === 'projected' && projection.date <= byDate;
  }
  return weeklyRateKg != null && weeklyRateKg < 0;
}

type RangeSelection =
  | { kind: 'preset'; months: number; label: string }
  | { kind: 'all' }
  | { kind: 'custom'; from: string; to: string };

const RANGE_PRESETS: { months: number; label: string }[] = [
  { months: 1, label: '1M' },
  { months: 3, label: '3M' },
  { months: 6, label: '6M' },
  { months: 12, label: '1Y' },
];

function resolveRange(range: RangeSelection): DateRange | null {
  if (range.kind === 'all') return null;
  if (range.kind === 'custom') return { from: range.from, to: range.to };
  return { from: subtractMonths(todayISO(), range.months), to: todayISO() };
}

export function WeightTracker() {
  const { user } = useAuth();
  const { entries, loaded, upsert, remove } = useWeightEntries(user?.uid);
  const { target, save: saveTarget, clear: clearTarget } = useWeightTarget(user?.uid);
  const [modalOpen, setModalOpen] = useState(false);
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  useBottomBarAction('Log', 'add', openAdd);
  const [editingEntry, setEditingEntry] = useState<WeightEntry | undefined>(undefined);
  const [range, setRange] = useState<RangeSelection>({ kind: 'all' });
  const [plotWidth, setPlotWidth] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<WeightPeriod | null>(null);
  const [mode, setMode] = useState<PeriodMode>('week');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function changeMode(next: PeriodMode) {
    if (next === mode) return;
    setMode(next);
    setExpanded(new Set());
  }

  function toggleExpanded(key: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const ascending = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = ascending[ascending.length - 1];
  const displayUnit: WeightUnit = latest?.unit ?? 'kg';

  const currentKg = latest ? toKg(latest.value, latest.unit) : null;

  function onPlotLayout(e: LayoutChangeEvent) {
    setPlotWidth(e.nativeEvent.layout.width);
  }

  function openAdd() {
    setEditingEntry(undefined);
    setModalOpen(true);
  }

  function openEdit(entry: WeightEntry) {
    setEditingEntry(entry);
    setModalOpen(true);
  }

  // Looks up an entry's true chronological predecessor in the full (unfiltered) history,
  // so deltas stay correct even when the date filter only shows part of the range.
  const dateIndex = new Map(ascending.map((e, i) => [e.date, i]));
  function prevOf(e: WeightEntry): WeightEntry | undefined {
    return ascending[dateIndex.get(e.date)! - 1];
  }

  const resolvedFilter = resolveRange(range);
  const filteredAscending = resolvedFilter
    ? ascending.filter((e) => e.date >= resolvedFilter.from && e.date <= resolvedFilter.to)
    : ascending;

  const chartSubtitle = (() => {
    if (range.kind === 'all') {
      if (!filteredAscending.length) return 'All time';
      return `${formatAxisDate(filteredAscending[0].date)} – ${formatAxisDate(filteredAscending[filteredAscending.length - 1].date)} · All time`;
    }
    const label = range.kind === 'preset' ? range.label : 'Custom';
    return `${formatAxisDate(resolvedFilter!.from)} – ${formatAxisDate(resolvedFilter!.to)} · ${label}`;
  })();

  // Trend and the weekly rate derive from the filtered window, so they reflect whatever
  // date range the user is currently viewing.
  const fit = fitWeightTrend(filteredAscending);
  const targetKg = target ? toKg(target.value, target.unit) : null;
  const weeklyRateKg = fit ? fit.slopeKgPerDay * 7 : null;

  // Single source of truth for "when will the target be reached" — the chart's projection
  // line/marker/x-axis label and the target card's badge/comment both read this, so the
  // date is always the same in both places.
  const targetProjection = projectTargetDate(currentKg, targetKg, weeklyRateKg);
  const onTrack = isOnTrack(targetProjection, target?.byDate, weeklyRateKg);

  // ── Aggregation ────────────────────────────────────────────────────────
  // The chart and the list both show one point/box per week or month — the average of that
  // period's entries. `allPeriods` (unfiltered) only supplies "vs previous period" deltas, so
  // the oldest visible period still gets a delta when the date filter cuts off its predecessor.
  const periods = groupWeightPeriods(filteredAscending, mode);
  const allPeriods = groupWeightPeriods(ascending, mode);
  const allPeriodIndex = new Map(allPeriods.map((p, i) => [p.key, i]));
  function prevPeriodDeltaKg(p: WeightPeriod): number | null {
    const prev = allPeriods[allPeriodIndex.get(p.key)! - 1];
    return prev ? p.avgKg - prev.avgKg : null;
  }
  const periodNoun = mode === 'week' ? 'week' : 'month';

  // ── Chart geometry ─────────────────────────────────────────────────────
  // Each average is plotted at the mean date of the entries it covers, on a true day scale.
  const chartPoints = periods;
  const chartBaseISO = chartPoints[0]?.centerISO;
  const lastPointISO = chartPoints[chartPoints.length - 1]?.centerISO;
  const lastOffset = chartPoints.length ? diffDays(lastPointISO, chartBaseISO) : 0;

  // The x-axis always runs to the end of the current month (its last tick), whatever range is
  // selected; it isn't stretched to the target or projected date.
  const today_ = fromISO(todayISO());
  const currentMonthEndISO = toISO(new Date(today_.getFullYear(), today_.getMonth() + 1, 0));
  const axisEndISO = lastPointISO && lastPointISO > currentMonthEndISO ? lastPointISO : currentMonthEndISO;
  const domainEndOffset = Math.max(chartBaseISO ? diffDays(axisEndISO, chartBaseISO) : 0, lastOffset, 1);

  const dataRightX = plotWidth - PLOT_RIGHT_PAD;

  function xForOffset(offset: number): number {
    if (chartPoints.length <= 1 && domainEndOffset <= 1) return (PLOT_LEFT_PAD + dataRightX) / 2;
    const usable = dataRightX - PLOT_LEFT_PAD;
    return PLOT_LEFT_PAD + (offset / domainEndOffset) * usable;
  }

  const pointKgValues = chartPoints.map((p) => p.avgKg);

  // The drawn trend line uses the regression's *slope* but is anchored at (today, currentKg)
  // — the exact same anchor projectTargetDate() uses — instead of the regression's own
  // intercept. That keeps it a single straight line while guaranteeing it passes through the
  // target at the projected reach date.
  function anchoredTrendKgAt(dateISO: string): number | null {
    if (!fit || currentKg == null) return null;
    return currentKg + fit.slopeKgPerDay * diffDays(dateISO, todayISO());
  }
  const trendAtBaseKg = chartBaseISO ? anchoredTrendKgAt(chartBaseISO) : null;
  const trendAtDomainEndKg = chartBaseISO ? anchoredTrendKgAt(addDays(chartBaseISO, domainEndOffset)) : null;

  const currentInView = !!(latest && filteredAscending.some((e) => e.id === latest.id));

  // Max/min are the highest and lowest *plotted* averages, so their badges line up with points
  // on the line. "Now" is the latest logged weight, matching the Current card above.
  const maxAvgKg = pointKgValues.length ? Math.max(...pointKgValues) : null;
  const minAvgKg = pointKgValues.length ? Math.min(...pointKgValues) : null;

  // Y-axis, on a GRID_STEP grid: the bottom is the next multiple of GRID_STEP strictly below
  // the lowest of the target and the displayed logged values (80 → 75, 81.8 → 80); the top is
  // the next multiple at or above the highest. The trend line doesn't widen the axis — it is
  // clipped to the plot instead, so a projection that runs past the target can't drag the
  // bottom down a whole extra step.
  const stepKg = toKg(GRID_STEP, displayUnit);
  const rangeCandidates = pointKgValues.length ? [...pointKgValues] : [toKg(DEFAULT_MAX, displayUnit), 0];
  if (targetKg != null) rangeCandidates.push(targetKg);
  if (currentInView && currentKg != null) rangeCandidates.push(currentKg);
  const EPS = 1e-6;
  const maxKg = Math.ceil((Math.max(...rangeCandidates) - EPS) / stepKg) * stepKg;
  const minKg = Math.floor((Math.min(...rangeCandidates) - EPS) / stepKg) * stepKg;
  const range_ = maxKg - minKg;

  const tickCount = Math.round(range_ / stepKg);
  const ticksKg = Array.from({ length: tickCount + 1 }, (_, i) => maxKg - i * stepKg);

  function yForKg(kg: number): number {
    const usable = PLOT_HEIGHT - PLOT_Y_PAD * 2;
    return PLOT_Y_PAD + (1 - (kg - minKg) / range_) * usable;
  }

  const baselineY = PLOT_HEIGHT - PLOT_Y_PAD;

  const linePoints = chartPoints.map((p, i) => ({
    x: xForOffset(diffDays(p.centerISO, chartBaseISO)),
    y: yForKg(pointKgValues[i]),
  }));

  // Marker per point — the max/min averages and the latest period get a bigger colored dot.
  const pointMarkers = chartPoints.map((p, i) => {
    const { x, y } = linePoints[i];
    const kg = pointKgValues[i];
    const isMax = maxAvgKg != null && Math.abs(kg - maxAvgKg) < 0.001;
    const isMin = minAvgKg != null && Math.abs(kg - minAvgKg) < 0.001;
    const isLatest = i === chartPoints.length - 1;
    const roleColor = isMin ? colors.success : isMax ? colors.danger : isLatest ? colors.accent : null;
    return {
      key: p.key,
      period: p,
      x, y,
      dotColor: roleColor ?? colors.accent,
      dotRadius: roleColor ? 3 : 1.75,
      ringRadius: roleColor ? 4.5 : 3,
    };
  });

  // ── Reference lines + badges ───────────────────────────────────────────
  // Each value gets a faint horizontal dashed line at its level, plus a number-only badge in a
  // centred row above the plot (the legend names the colours).
  const refLineDefs: { key: string; kg: number; color: string }[] = [];
  if (maxAvgKg != null) refLineDefs.push({ key: 'max', kg: maxAvgKg, color: colors.danger });
  if (minAvgKg != null) refLineDefs.push({ key: 'min', kg: minAvgKg, color: colors.success });
  if (currentInView && currentKg != null) refLineDefs.push({ key: 'now', kg: currentKg, color: colors.accent });
  if (targetKg != null) refLineDefs.push({ key: 'goal', kg: targetKg, color: TARGET_COLOR });

  const refLinesWithY = refLineDefs.map((l) => ({ ...l, y: yForKg(l.kg) }));
  const badges = refLinesWithY;

  // When two or more reference lines land at (nearly) the same height, offset each one's dash
  // pattern by an even fraction of the cycle so they interleave instead of painting over each other.
  const refLineClusters: (typeof refLinesWithY)[] = [];
  {
    const used = new Set<number>();
    refLinesWithY.forEach((l, i) => {
      if (used.has(i)) return;
      const cluster = [l];
      used.add(i);
      refLinesWithY.forEach((other, j) => {
        if (i !== j && !used.has(j) && Math.abs(other.y - l.y) < 2) {
          cluster.push(other);
          used.add(j);
        }
      });
      refLineClusters.push(cluster);
    });
  }

  // ── X-axis: a uniform day step chosen from the visible span keeps ticks regular,
  // equidistant, and readable at any timeframe.
  // Ticks mark month ends only (see monthEndTicks).
  const xTicks: string[] = chartBaseISO && axisEndISO ? monthEndTicks(chartBaseISO, axisEndISO) : [];
  const xLabelRotation = 45;
  const xTickPositions = xTicks.map((iso) => {
    const x = xForOffset(diffDays(iso, chartBaseISO));
    return { iso, x, label: formatXTickLabel(iso) };
  });

  // ── List: one box per period, newest first; entries inside newest first too.
  const listPeriods = [...periods].reverse().map((p) => ({
    period: p,
    label: formatPeriodLabel(p, mode),
    delta: prevPeriodDeltaKg(p),
    items: [...p.entries].reverse().map((e) => {
      const prevChron = prevOf(e);
      const delta = prevChron ? toKg(e.value, e.unit) - toKg(prevChron.value, prevChron.unit) : null;
      return { entry: e, delta };
    }),
  }));

  return (
    <View style={styles.container}>
      {!loaded ? null : entries.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="monitor-weight" size={48} color={colors.textDim} />
          <Text style={styles.emptyText}>No weight logged yet.{'\n'}Log your first entry.</Text>
          <Pressable onPress={openAdd} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Log</Text>
          </Pressable>
        </View>
      ) : filteredAscending.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="filter-list-off" size={48} color={colors.textDim} />
          <Text style={styles.emptyText}>No entries in this date range.</Text>
          <Pressable onPress={openAdd} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Log</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LabeledBox
            label={`${TARGET_ICON} Target`}
            style={styles.card}
          >
            <Pressable onPress={() => setTargetModalOpen(true)} style={styles.targetBody}>
              {!target ? (
                <View style={styles.targetEmpty}>
                  <MaterialIcons name="add-circle-outline" size={18} color={colors.accent} />
                  <Text style={styles.targetHint}>Set a target weight to see when you'll reach it.</Text>
                </View>
              ) : (
                <>
                  <View style={styles.targetProgress}>
                    <TargetProgress
                      today={todayISO()}
                      goalDate={target.byDate}
                      projection={targetProjection}
                      onTrack={onTrack}
                      goalColor={TARGET_COLOR}
                    />
                  </View>
                  <View style={styles.targetValueCol}>
                    <Text style={styles.targetValue}>
                      {formatValue(targetKg!, displayUnit)}<Text style={styles.targetUnit}> {displayUnit}</Text>
                    </Text>
                    {weeklyRateKg != null && (
                      <View style={[styles.statusBadge, styles.targetStatus, { backgroundColor: `${onTrack ? colors.success : colors.danger}22` }]}>
                        <Text style={[styles.statusBadgeText, { color: onTrack ? colors.success : colors.danger }]}>
                          {onTrack ? 'On track' : 'Off track'}
                        </Text>
                      </View>
                    )}
                    {currentKg != null && (
                      <Text style={styles.targetToGo}>
                        {Math.abs(currentKg - targetKg!) < 0.05 ? 'reached' : `${fromKg(Math.abs(currentKg - targetKg!), displayUnit).toFixed(1)} ${displayUnit} to go`}
                      </Text>
                    )}
                  </View>
                </>
              )}
            </Pressable>
          </LabeledBox>

          <LabeledBox
            label={`${CHART_ICON} Evolution`}
            style={styles.card}
          >
            <Text style={styles.chartSubtitle}>
              {chartSubtitle} · {chartPoints.length} {chartPoints.length === 1 ? periodNoun : `${periodNoun}s`} · {filteredAscending.length} {filteredAscending.length === 1 ? 'entry' : 'entries'}
            </Text>

            <View style={styles.rangeRow}>
              {RANGE_PRESETS.map((p) => {
                const active = range.kind === 'preset' && range.months === p.months;
                return (
                  <Pressable
                    key={p.months}
                    onPress={() => setRange({ kind: 'preset', months: p.months, label: p.label })}
                    style={[styles.rangeChip, active && styles.rangeChipActive]}
                  >
                    <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>{p.label}</Text>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => setRange({ kind: 'all' })} style={[styles.rangeChip, range.kind === 'all' && styles.rangeChipActive]}>
                <Text style={[styles.rangeChipText, range.kind === 'all' && styles.rangeChipTextActive]}>All</Text>
              </Pressable>
              <Pressable
                onPress={() => setFilterModalOpen(true)}
                style={[styles.rangeChip, styles.rangeChipIcon, range.kind === 'custom' && styles.rangeChipActive]}
              >
                <MaterialIcons name="tune" size={14} color={range.kind === 'custom' ? '#fff' : colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.legendRow}>
              {badges.map((b) => (
                <View key={`legend-${b.key}`} style={styles.legendItem}>
                  <Svg width={20} height={6}>
                    <Line x1={0} y1={3} x2={20} y2={3} stroke={b.color} strokeWidth={1.5} strokeOpacity={REF_OPACITY} strokeDasharray={REF_DASH} />
                  </Svg>
                  <Text style={styles.legendText}>{BADGE_NAMES[b.key]}</Text>
                </View>
              ))}
            </View>

            <View style={styles.chartBody} onLayout={onPlotLayout}>
              {plotWidth > 0 && chartPoints.length > 0 && (
                <>
                  <View style={styles.badgeBand}>
                    {badges.map((b) => (
                      <View
                        key={`badge-${b.key}`}
                        style={[styles.valueBadge, { backgroundColor: `${b.color}22` }]}
                      >
                        <Text style={[styles.valueBadgeText, { color: b.color }]}>{formatValue(b.kg, displayUnit)}</Text>
                      </View>
                    ))}
                  </View>
                  <Svg width={plotWidth} height={TOTAL_SVG_HEIGHT}>
                    {ticksKg.map((v, i) => (
                      <Fragment key={i}>
                        <Line x1={GRID_LEFT} y1={yForKg(v)} x2={plotWidth} y2={yForKg(v)} stroke={colors.border} strokeWidth={1} />
                        <SvgText x={Y_AXIS_WIDTH} y={yForKg(v) + 3.5} fontSize={10} fill={colors.textDim} textAnchor="end">
                          {formatValue(v, displayUnit)}
                        </SvgText>
                      </Fragment>
                    ))}

                    {refLineClusters.map((cluster) => cluster.map((l, idx) => (
                      <Line
                        key={l.key}
                        x1={GRID_LEFT} y1={l.y} x2={plotWidth} y2={l.y}
                        stroke={l.color} strokeWidth={1} strokeOpacity={REF_OPACITY}
                        strokeDasharray={REF_DASH}
                        strokeDashoffset={cluster.length > 1 ? (idx * REF_DASH_CYCLE) / cluster.length : 0}
                      />
                    )))}

                    {linePoints.length > 1 && (
                      <Polyline
                        points={linePoints.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={colors.accent}
                        strokeWidth={1.5}
                      />
                    )}

                    {pointMarkers.map((p) => (
                      <Fragment key={p.key}>
                        <Circle cx={p.x} cy={p.y} r={p.ringRadius} fill={colors.surface} />
                        <Circle cx={p.x} cy={p.y} r={p.dotRadius} fill={p.dotColor} />
                        <Circle cx={p.x} cy={p.y} r={12} fill="transparent" onPress={() => setSelectedPeriod(p.period)} />
                      </Fragment>
                    ))}

                    {xTickPositions.map(({ iso, x, label }) => (
                      <Fragment key={iso}>
                        <Line x1={x} y1={baselineY} x2={x} y2={baselineY + 5} stroke={colors.border} strokeWidth={1} />
                        {label != null && <SvgText
                          x={x}
                          y={baselineY + 16}
                          fontSize={10}
                          fill={colors.textDim}
                          textAnchor={xLabelRotation > 0 ? 'end' : 'middle'}
                          transform={xLabelRotation > 0 ? `rotate(${-xLabelRotation} ${x} ${baselineY + 16})` : undefined}
                        >
                          {label}
                        </SvgText>}
                      </Fragment>
                    ))}

                  </Svg>
                </>
              )}
            </View>

            <View style={styles.modeToggleRow}>
              <View style={styles.modeToggle}>
                {PERIOD_MODES.map((m) => {
                  const active = m.mode === mode;
                  return (
                    <Pressable
                      key={m.mode}
                      onPress={() => changeMode(m.mode)}
                      style={[styles.modeOption, active && styles.modeOptionActive]}
                    >
                      <Text style={[styles.modeOptionText, active && styles.modeOptionTextActive]}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </LabeledBox>

          <View style={styles.list}>
            {listPeriods.map(({ period, label, delta, items }) => {
              const isOpen = expanded.has(period.key);
              const count = period.entries.length;
              return (
                <View key={period.key} style={styles.periodBox}>
                  <Pressable style={styles.periodHeader} onPress={() => toggleExpanded(period.key)}>
                    <View style={styles.periodInfo}>
                      <Text style={styles.periodLabel}>{label}</Text>
                      <Text style={styles.periodCount}>{count} {count === 1 ? 'entry' : 'entries'}</Text>
                    </View>
                    <View style={styles.periodValues}>
                      <Text style={styles.periodAvg}>
                        {formatValue(period.avgKg, displayUnit)} <Text style={styles.statUnit}>{displayUnit}</Text>
                      </Text>
                      <Text style={[styles.periodDelta, deltaColor(delta)]}>
                        {delta == null ? ' ' : formatDelta(delta, displayUnit)}
                      </Text>
                    </View>
                    <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={20} color={colors.textMuted} />
                  </Pressable>
                  {isOpen && (
                    <View style={styles.periodEntries}>
                      {items.map(({ entry: e, delta: entryDelta }) => (
                        <Pressable key={e.id} style={styles.row} onPress={() => openEdit(e)}>
                          <View style={styles.rowDate}>
                            <Text style={styles.rowDateText}>{formatRowDate(e.date)}</Text>
                          </View>
                          <Text style={styles.rowValue}>{e.value.toFixed(1)} {e.unit}</Text>
                          <Text style={[styles.rowDelta, deltaColor(entryDelta)]}>
                            {entryDelta == null ? '' : formatDelta(entryDelta, displayUnit)}
                          </Text>
                          {e.note ? <MaterialIcons name="notes" size={14} color={colors.textDim} /> : null}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      <WeightEntryModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        entry={editingEntry}
        defaultUnit={displayUnit}
        onSave={upsert}
        onDelete={remove}
      />

      <WeightTargetModal
        visible={targetModalOpen}
        onClose={() => setTargetModalOpen(false)}
        target={target}
        defaultUnit={displayUnit}
        onSave={saveTarget}
        onClear={clearTarget}
      />

      <WeightDateFilterModal
        visible={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        value={range.kind === 'custom' ? { from: range.from, to: range.to } : null}
        onApply={(r) => setRange({ kind: 'custom', from: r.from, to: r.to })}
        onClear={() => setRange({ kind: 'all' })}
      />

      <WeightPointDetailModal
        visible={selectedPeriod != null}
        onClose={() => setSelectedPeriod(null)}
        period={selectedPeriod}
        mode={mode}
        unit={displayUnit}
        deltaVsPrevKg={selectedPeriod ? prevPeriodDeltaKg(selectedPeriod) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  addBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textDim, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  scrollContent: { padding: spacing.lg, gap: spacing.lg },
  statUnit: { fontSize: font.sm, fontWeight: '500', color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.md,
    paddingTop: spacing.md + 4,
    gap: spacing.sm,
  },
  targetBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  targetEmpty: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  targetHint: { flex: 1, color: colors.textDim, fontSize: font.sm, lineHeight: 18 },
  targetProgress: { flex: 1 },
  targetValueCol: { alignItems: 'flex-end' },
  // Value and "to go" take equal height above and below the status badge, so the badge sits at
  // the column's centre, level with the progress bar's track (also centred in its column).
  targetValue: { color: TARGET_COLOR, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  targetUnit: { fontSize: font.md, fontWeight: '600', color: colors.textMuted },
  targetToGo: { color: colors.textMuted, fontSize: font.sm, lineHeight: 18, marginBottom: 16 },
  targetStatus: { marginVertical: 3 },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 4 },
  statusBadgeText: { fontSize: 11, lineHeight: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  rangeRow: { flexDirection: 'row', gap: spacing.xs },
  rangeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    borderRadius: radius.sm - 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  rangeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  rangeChipText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  rangeChipTextActive: { color: '#fff' },
  rangeChipIcon: { flex: 0.7 },
  chartSubtitle: { color: colors.textDim, fontSize: font.sm },
  // Pushed down (and the badge band pulled into the SVG's empty top padding by the same amount)
  // so legend + badges sit centred between the range chips and the top of the plot.
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, marginTop: LEGEND_SHIFT },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendText: { color: colors.textMuted, fontSize: font.sm },
  chartBody: { height: BADGE_BAND - LEGEND_SHIFT + TOTAL_SVG_HEIGHT },
  badgeBand: { height: BADGE_BAND, marginBottom: -LEGEND_SHIFT, zIndex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: spacing.sm },
  // Same look as the app's other status badges: tinted background, coloured bold text, no border.
  valueBadge: {
    minWidth: BADGE_WIDTH,
    height: BADGE_HEIGHT,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueBadgeText: { fontSize: 11, lineHeight: 13, fontWeight: '700', letterSpacing: 0.5 },
  modeToggleRow: { alignItems: 'center' },
  modeToggle: {
    flexDirection: 'row',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    padding: 2,
  },
  modeOption: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm - 3 },
  modeOptionActive: { backgroundColor: colors.accent },
  modeOptionText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  modeOptionTextActive: { color: '#fff' },
  list: { gap: spacing.sm },
  periodBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    overflow: 'hidden',
  },
  periodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  periodInfo: { flex: 1, gap: 2 },
  periodLabel: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  periodCount: { color: colors.textDim, fontSize: font.sm },
  periodValues: { alignItems: 'flex-end', gap: 2 },
  periodAvg: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  periodDelta: { fontSize: font.sm, fontWeight: '500' },
  periodEntries: {
    borderTopWidth: 1,
    borderTopColor: colors.surface2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rowDate: { width: 96 },
  rowDateText: { color: colors.textMuted, fontSize: font.sm },
  rowValue: { flex: 1, color: colors.text, fontSize: font.md, fontWeight: '600' },
  rowDelta: { fontSize: font.sm, fontWeight: '500', minWidth: 64, textAlign: 'right' },
});
