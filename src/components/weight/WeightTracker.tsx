import { Fragment, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, LayoutChangeEvent } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Polyline, Line, Circle, Text as SvgText } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { useWeightEntries, useWeightTarget } from '../../store/weightStore';
import { WeightEntryModal } from './WeightEntryModal';
import { WeightTargetModal } from './WeightTargetModal';
import { WeightDateFilterModal, type DateRange } from './WeightDateFilterModal';
import { WeightPointDetailModal } from './WeightPointDetailModal';
import { colors, spacing, font, radius } from '../../theme';
import { fromISO, toISO, diffDays, addDays, todayISO } from '../../lib/schedule';
import { fitWeightTrend } from '../../lib/weightTrend';
import { toKg, fromKg, formatDelta, deltaColor, type WeightEntry, type WeightUnit } from '../../types/weight';

const PLOT_HEIGHT = 220;
const PLOT_Y_PAD = 28;
// Every tick label is the same fixed "DD MMM YYYY" shape at a fixed 45° slant, so this can be
// a precise constant rather than a guess: ~11 chars * 5.5px * cos(45°) ≈ 43px of leftward
// overhang from the first tick (which sits exactly at offset 0, i.e. this same x). Sized so
// the label's own left edge lands right at the plot's left boundary — no extra gap, no clip.
const PLOT_LEFT_PAD = 44;
const PLOT_RIGHT_PAD = 12;
const XAXIS_HEIGHT = 44; // reserved below the plot for rotated tick labels
const TOTAL_SVG_HEIGHT = PLOT_HEIGHT + XAXIS_HEIGHT;
const Y_AXIS_WIDTH = 38;
const GRID_STEP = 5; // y-axis tick spacing, in the displayed unit
const DEFAULT_MAX = 100; // y-axis max fallback (displayed unit) when nothing is logged yet
const TREND_COLOR = colors.textMuted;
const TARGET_COLOR = '#F59E0B';
const TARGET_ICON = '🎯';
const CHART_ICON = '📈';
const DOT_DASH = '0.1,6'; // near-zero dash + round cap renders as a true dot, not a short dash
const DOT_CYCLE = 6.1;
const REF_DASH = '4,4'; // regular dashes for the max/min/current/target reference lines
const REF_DASH_CYCLE = 8;

function formatRowDate(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

function formatAxisDate(iso: string): string {
  const d = fromISO(iso);
  const month = d.toLocaleDateString(undefined, { month: 'short' });
  return `${d.getDate()} ${month} '${String(d.getFullYear()).slice(-2)}`;
}

function formatMonthLabel(monthKey: string): string {
  return fromISO(`${monthKey}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatValue(kg: number, unit: WeightUnit): string {
  return fromKg(kg, unit).toFixed(1);
}

function subtractMonths(iso: string, months: number): string {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() - months, d.getDate()));
}

/** Regular day-spaced ticks from startISO, stepping by `stepDays` — always starts exactly at
 * startISO, so the first tick lines up precisely with the left edge of the plot. */
function dayStepTicks(startISO: string, endISO: string, stepDays: number): string[] {
  const totalDays = diffDays(endISO, startISO);
  const ticks: string[] = [];
  for (let d = 0; d <= totalDays; d += stepDays) ticks.push(addDays(startISO, d));
  return ticks;
}

// Covers anything from a few days to decades, always keeping tick count to ~5-8. A uniform
// day step (rather than calendar-month alignment) is what guarantees the ticks land exactly
// equidistant in pixels, since the x-scale itself is linear in days.
const DAY_STEP_CANDIDATES = [
  1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 182, 270,
  365, 548, 730, 1095, 1461, 1826, 2557, 3653, 5479, 7305,
];

/** Picks a uniform day step from the span so the axis always shows a regular, equidistant,
 * readable set of ticks (~5-8) — dynamic to whatever timeframe is in view. */
function chooseXTicks(startISO: string, endISO: string): string[] {
  const totalDays = diffDays(endISO, startISO);
  let step = DAY_STEP_CANDIDATES[DAY_STEP_CANDIDATES.length - 1];
  for (const s of DAY_STEP_CANDIDATES) {
    if (Math.ceil(totalDays / s) + 1 <= 8) { step = s; break; }
  }
  return dayStepTicks(startISO, endISO, step);
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

function projectionComment(p: TargetProjection, byDate?: string): string {
  switch (p.kind) {
    case 'reached': return 'Target reached!';
    case 'projected':
      if (byDate) {
        return p.date <= byDate
          ? `Projected ${formatAxisDate(p.date)} — ahead of your ${formatAxisDate(byDate)} goal`
          : `Projected ${formatAxisDate(p.date)} — past your ${formatAxisDate(byDate)} goal`;
      }
      return `Projected ${formatAxisDate(p.date)}`;
    case 'never':
      return byDate ? `Won’t reach it by ${formatAxisDate(byDate)} at this rate` : 'Won’t reach at this rate';
  }
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
  const [editingEntry, setEditingEntry] = useState<WeightEntry | undefined>(undefined);
  const [range, setRange] = useState<RangeSelection>({ kind: 'all' });
  const [plotWidth, setPlotWidth] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<WeightEntry | null>(null);

  const ascending = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = ascending[ascending.length - 1];
  const previous = ascending[ascending.length - 2];
  const first = ascending[0];
  const displayUnit: WeightUnit = latest?.unit ?? 'kg';

  const currentKg = latest ? toKg(latest.value, latest.unit) : null;
  const deltaSincePrev = latest && previous ? currentKg! - toKg(previous.value, previous.unit) : null;
  const deltaAllTime = latest && first && first !== latest ? currentKg! - toKg(first.value, first.unit) : null;

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

  // Latest entry on or before `dateISO` — used to find "one week ago" even when that
  // exact day wasn't logged.
  function entryOnOrBefore(dateISO: string): WeightEntry | undefined {
    let lo = 0, hi = ascending.length - 1, result: WeightEntry | undefined;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ascending[mid].date <= dateISO) { result = ascending[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return result;
  }

  function openDetail(entry: WeightEntry) {
    setSelectedEntry(entry);
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

  const selectedPrevEntry = selectedEntry ? prevOf(selectedEntry) : undefined;
  const selectedDeltaPrevKg = selectedEntry && selectedPrevEntry
    ? toKg(selectedEntry.value, selectedEntry.unit) - toKg(selectedPrevEntry.value, selectedPrevEntry.unit)
    : null;
  const selectedWeekAgoEntry = selectedEntry ? entryOnOrBefore(addDays(selectedEntry.date, -7)) : undefined;
  const selectedDeltaWeekKg = selectedEntry && selectedWeekAgoEntry
    ? toKg(selectedEntry.value, selectedEntry.unit) - toKg(selectedWeekAgoEntry.value, selectedWeekAgoEntry.unit)
    : null;

  // ── Chart geometry ─────────────────────────────────────────────────────
  // No point cap — the chart always plots exactly the entries in the selected range, so it
  // never disagrees with the list below it.
  const chartEntries = filteredAscending;
  const chartBaseISO = chartEntries[0]?.date;
  const lastEntryISO = chartEntries[chartEntries.length - 1]?.date;
  const lastOffset = chartEntries.length ? diffDays(lastEntryISO, chartBaseISO) : 0;

  // Always extend to show the projection, no matter how far out it lands — a distant
  // target shouldn't make its own marker disappear.
  const targetReachDate = targetProjection.kind === 'projected' ? targetProjection.date : null;
  const extendChart = targetReachDate != null;
  const projectedOffset = extendChart && targetReachDate && chartBaseISO ? diffDays(targetReachDate, chartBaseISO) : null;
  const domainEndOffset = Math.max(lastOffset, projectedOffset ?? 0, 1);

  function xForOffset(offset: number): number {
    if (chartEntries.length <= 1) return (PLOT_LEFT_PAD + (plotWidth - PLOT_RIGHT_PAD)) / 2;
    const usable = plotWidth - PLOT_LEFT_PAD - PLOT_RIGHT_PAD;
    return PLOT_LEFT_PAD + (offset / domainEndOffset) * usable;
  }

  const barKgValues = chartEntries.map((e) => toKg(e.value, e.unit));

  // The drawn trend line uses the regression's *slope* but is anchored at (today, currentKg)
  // — the exact same anchor projectTargetDate() uses — instead of the regression's own
  // intercept. That keeps it a single straight line (constant slope, no kink) while also
  // guaranteeing it actually passes through the target at the projected reach date: that
  // date was solved for on this same line, so evaluating it here lands back on targetKg
  // (up to sub-day rounding). Anchoring at the regression's own fitted "today" value instead
  // would drift away from the target the further out the projection reaches.
  function anchoredTrendKgAt(dateISO: string): number | null {
    if (!fit || currentKg == null) return null;
    return currentKg + fit.slopeKgPerDay * diffDays(dateISO, todayISO());
  }
  const trendAtBaseKg = chartBaseISO ? anchoredTrendKgAt(chartBaseISO) : null;
  const trendAtDomainEndKg = chartBaseISO ? anchoredTrendKgAt(addDays(chartBaseISO, domainEndOffset)) : null;

  // Y-axis: top is the highest of the logged values / target / trend line (100 as a sane
  // default with no data yet) — folding the trend line's own endpoints in here guarantees
  // it's always fully contained inside the plot, never drawn above/below the visible area.
  // Ticks are equidistant GRID_STEP-unit steps, and the bottom tick is always at least one
  // full step below the lowest such value, so both ends land cleanly on the same 5-unit grid.
  const stepKg = toKg(GRID_STEP, displayUnit);
  const maxLoggedKg = barKgValues.length ? Math.max(...barKgValues) : toKg(DEFAULT_MAX, displayUnit);
  const minLoggedKg = barKgValues.length ? Math.min(...barKgValues) : 0;
  const rangeCandidates = [maxLoggedKg, minLoggedKg];
  if (targetKg != null) rangeCandidates.push(targetKg);
  if (trendAtBaseKg != null) rangeCandidates.push(trendAtBaseKg);
  if (trendAtDomainEndKg != null) rangeCandidates.push(trendAtDomainEndKg);
  const maxWithTargetKg = Math.max(...rangeCandidates);
  const minWithTargetKg = Math.min(...rangeCandidates);
  const maxKg = Math.ceil(maxWithTargetKg / stepKg) * stepKg;
  const minKg = Math.floor((minWithTargetKg - stepKg) / stepKg) * stepKg;
  const range_ = maxKg - minKg;

  const tickCount = Math.round(range_ / stepKg);
  const ticksKg = Array.from({ length: tickCount + 1 }, (_, i) => maxKg - i * stepKg);

  function yForKg(kg: number): number {
    const usable = PLOT_HEIGHT - PLOT_Y_PAD * 2;
    return PLOT_Y_PAD + (1 - (kg - minKg) / range_) * usable;
  }

  const baselineY = PLOT_HEIGHT - PLOT_Y_PAD;
  const linePoints = chartEntries.map((e, i) => ({
    x: xForOffset(diffDays(e.date, chartBaseISO)),
    y: yForKg(barKgValues[i]),
  }));

  const targetDateTickX = extendChart && projectedOffset != null ? xForOffset(projectedOffset) : null;
  const targetDateLabel = extendChart && targetReachDate ? formatXTickLabel(targetReachDate) : null;

  // Marker geometry per point — min/max/current get a bigger ringed dot; everything else
  // stays a small subtle dot. Values are shown as badges to the right of the chart instead
  // of floating on the chart itself, so they never overlap the data.
  const pointMarkers = chartEntries.map((e, i) => {
    const { x, y } = linePoints[i];
    const kg = barKgValues[i];
    const isMax = Math.abs(kg - maxLoggedKg) < 0.001;
    const isMin = Math.abs(kg - minLoggedKg) < 0.001;
    const isCurrent = latest ? e.id === latest.id : false;
    // Priority: minimum > maximum > current — a point that's both the lowest ever and
    // today's reading reads as the minimum (green).
    const roleColor = isMin ? colors.success : isMax ? colors.danger : isCurrent ? colors.accent : null;
    return {
      key: e.id,
      entry: e,
      x, y,
      dotColor: roleColor ?? colors.accent,
      dotRadius: roleColor ? 4 : 2,
      ringRadius: roleColor ? 6 : 4,
    };
  });

  const currentInView = !!(latest && chartEntries.some((e) => e.id === latest.id));

  // Horizontal dotted reference lines for max/min/current/target. When two or more land at
  // (nearly) the same height, they'd otherwise just paint over each other — instead each
  // member of the cluster gets the dash pattern offset by an even fraction of the cycle, so
  // the dots interleave into one continuous line alternating between the colors.
  const refLineDefs: { key: string; kg: number; color: string }[] = [];
  if (chartEntries.length > 0) {
    refLineDefs.push({ key: 'max', kg: maxLoggedKg, color: colors.danger });
    refLineDefs.push({ key: 'min', kg: minLoggedKg, color: colors.success });
    if (currentInView && currentKg != null) refLineDefs.push({ key: 'now', kg: currentKg, color: colors.accent });
  }
  if (targetKg != null) refLineDefs.push({ key: 'goal', kg: targetKg, color: TARGET_COLOR });

  const refLinesWithY = refLineDefs.map((l) => ({ ...l, y: yForKg(l.kg) }));
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

  // ── X-axis: a uniform day step is chosen from the visible span so ticks stay regular,
  // equidistant, and readable at any timeframe — dynamic, recomputed whenever the range
  // selection (or the projection) changes what's in view. Always the same 45° slant so it's
  // predictable rather than jumping between angles.
  const axisEndISO = extendChart && targetReachDate ? targetReachDate : lastEntryISO;
  const xTicksRaw = chartBaseISO && axisEndISO ? chooseXTicks(chartBaseISO, axisEndISO) : [];
  const xTicks = xTicksRaw.length ? xTicksRaw : (chartBaseISO && axisEndISO ? [chartBaseISO, axisEndISO] : []);
  const xTickPositions = xTicks.map((iso) => ({ iso, x: xForOffset(diffDays(iso, chartBaseISO)) }));
  const xTickLabels = xTicks.map((iso) => formatXTickLabel(iso));
  const xLabelRotation = 45;

  const descendingWithDelta = [...filteredAscending].reverse().map((e) => {
    const prevChron = prevOf(e);
    const delta = prevChron ? toKg(e.value, e.unit) - toKg(prevChron.value, prevChron.unit) : null;
    return { entry: e, delta };
  });

  const monthGroups: { key: string; label: string; avgKg: number; items: typeof descendingWithDelta }[] = [];
  for (const item of descendingWithDelta) {
    const key = item.entry.date.slice(0, 7);
    const lastGroup = monthGroups[monthGroups.length - 1];
    if (lastGroup && lastGroup.key === key) {
      lastGroup.items.push(item);
    } else {
      monthGroups.push({ key, label: formatMonthLabel(key), avgKg: 0, items: [item] });
    }
  }
  for (const g of monthGroups) {
    g.avgKg = g.items.reduce((a, it) => a + toKg(it.entry.value, it.entry.unit), 0) / g.items.length;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Weight</Text>
        <Pressable onPress={openAdd} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Log</Text>
        </Pressable>
      </View>

      {!loaded ? null : entries.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="monitor-weight" size={48} color={colors.textDim} />
          <Text style={styles.emptyText}>No weight logged yet.{'\n'}Log your first entry.</Text>
        </View>
      ) : filteredAscending.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="filter-list-off" size={48} color={colors.textDim} />
          <Text style={styles.emptyText}>No entries in this date range.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Current</Text>
              <Text style={styles.statValue}>{formatValue(currentKg!, displayUnit)} <Text style={styles.statUnit}>{displayUnit}</Text></Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Since last</Text>
              <Text style={[styles.statValue, deltaColor(deltaSincePrev)]}>
                {deltaSincePrev == null ? '—' : formatDelta(deltaSincePrev, displayUnit)}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>All time</Text>
              <Text style={[styles.statValue, deltaColor(deltaAllTime)]}>
                {deltaAllTime == null ? '—' : formatDelta(deltaAllTime, displayUnit)}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Weekly avg</Text>
              <Text style={[styles.statValue, deltaColor(weeklyRateKg)]}>
                {weeklyRateKg == null ? '—' : formatDelta(weeklyRateKg, displayUnit)}
              </Text>
            </View>
          </View>

          <View style={styles.targetCard}>
            <View style={styles.targetHeader}>
              <View style={styles.targetHeaderLeft}>
                <Text style={styles.targetFlagIcon}>{TARGET_ICON}</Text>
                <Text style={styles.targetTitle}>Target</Text>
              </View>
              <Pressable onPress={() => setTargetModalOpen(true)} hitSlop={8}>
                <MaterialIcons name={target ? 'edit' : 'add-circle-outline'} size={18} color={colors.accent} />
              </Pressable>
            </View>
            {!target ? (
              <Text style={styles.targetHint}>Set a target weight to see a prognosis based on your current trend.</Text>
            ) : (
              <View style={styles.targetValueRow}>
                <Text style={styles.targetValue}>{formatValue(targetKg!, displayUnit)} <Text style={styles.statUnit}>{displayUnit}</Text></Text>
                {weeklyRateKg != null && (
                  <>
                    <View style={[styles.statusBadge, onTrack ? styles.statusBadgeOn : styles.statusBadgeOff]}>
                      <Text style={styles.statusBadgeText}>{onTrack ? '🟢 ON TRACK' : '🔴 OFF TRACK'}</Text>
                    </View>
                    <Text style={styles.prognosisText}>{projectionComment(targetProjection, target?.byDate)}</Text>
                  </>
                )}
              </View>
            )}
          </View>

          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartHeaderIcon}>{CHART_ICON}</Text>
              <Text style={styles.chartHeaderTitle}>Evolution</Text>
            </View>

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

            <Text style={styles.chartSubtitle}>{chartSubtitle} · {chartEntries.length} {chartEntries.length === 1 ? 'entry' : 'entries'}</Text>

            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <Svg width={20} height={6}>
                  <Line x1={0} y1={3} x2={20} y2={3} stroke={colors.accent} strokeWidth={1.5} />
                </Svg>
                <Text style={styles.legendText}>Weight ({displayUnit})</Text>
              </View>
              <View style={styles.legendItem}>
                <Svg width={20} height={6}>
                  <Line x1={0} y1={3} x2={20} y2={3} stroke={TREND_COLOR} strokeWidth={1.5} strokeDasharray="0.1,6" strokeLinecap="round" />
                </Svg>
                <Text style={styles.legendText}>Trend</Text>
              </View>
              {chartEntries.length > 0 && (
                <View style={styles.legendItem}>
                  <Svg width={20} height={6}>
                    <Line x1={0} y1={3} x2={20} y2={3} stroke={colors.danger} strokeWidth={1} strokeDasharray={REF_DASH} />
                  </Svg>
                  <Text style={styles.legendText}>Max</Text>
                </View>
              )}
              {chartEntries.length > 0 && (
                <View style={styles.legendItem}>
                  <Svg width={20} height={6}>
                    <Line x1={0} y1={3} x2={20} y2={3} stroke={colors.success} strokeWidth={1} strokeDasharray={REF_DASH} />
                  </Svg>
                  <Text style={styles.legendText}>Min</Text>
                </View>
              )}
              {currentInView && (
                <View style={styles.legendItem}>
                  <Svg width={20} height={6}>
                    <Line x1={0} y1={3} x2={20} y2={3} stroke={colors.accent} strokeWidth={1} strokeDasharray={REF_DASH} />
                  </Svg>
                  <Text style={styles.legendText}>Now</Text>
                </View>
              )}
              {target && (
                <View style={styles.legendItem}>
                  <Svg width={20} height={6}>
                    <Line x1={0} y1={3} x2={20} y2={3} stroke={TARGET_COLOR} strokeWidth={1} strokeDasharray={REF_DASH} />
                  </Svg>
                  <Text style={styles.legendText}>Target</Text>
                </View>
              )}
            </View>

            <View style={styles.chartBody}>
              <View style={styles.yAxis}>
                {ticksKg.map((v, i) => (
                  <Text key={i} style={[styles.axisLabel, styles.axisLabelAbs, { top: yForKg(v) }]}>
                    {formatValue(v, displayUnit)}
                  </Text>
                ))}
              </View>

              <View style={styles.plotArea} onLayout={onPlotLayout}>
                {plotWidth > 0 && chartEntries.length > 0 && (
                  <Svg width={plotWidth} height={TOTAL_SVG_HEIGHT}>
                    {ticksKg.map((v, i) => (
                      <Line key={i} x1={0} y1={yForKg(v)} x2={plotWidth} y2={yForKg(v)} stroke={colors.border} strokeWidth={1} />
                    ))}

                    {refLineClusters.map((cluster) => cluster.map((l, idx) => (
                      <Line
                        key={l.key}
                        x1={0} y1={l.y} x2={plotWidth} y2={l.y}
                        stroke={l.color} strokeWidth={1}
                        strokeDasharray={REF_DASH}
                        strokeDashoffset={cluster.length > 1 ? (idx * REF_DASH_CYCLE) / cluster.length : 0}
                      />
                    )))}

                    {targetDateTickX != null && (
                      <Line
                        x1={targetDateTickX} y1={PLOT_Y_PAD} x2={targetDateTickX} y2={baselineY}
                        stroke={TARGET_COLOR} strokeWidth={0.75} strokeDasharray="4,4"
                      />
                    )}

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
                        <Circle cx={p.x} cy={p.y} r={12} fill="transparent" onPress={() => openDetail(p.entry)} />
                      </Fragment>
                    ))}

                    {fit && trendAtBaseKg != null && trendAtDomainEndKg != null && (
                      <Line
                        x1={xForOffset(0)} y1={yForKg(trendAtBaseKg)}
                        x2={xForOffset(domainEndOffset)} y2={yForKg(trendAtDomainEndKg)}
                        stroke={TREND_COLOR} strokeWidth={1.5} strokeDasharray={DOT_DASH} strokeLinecap="round"
                      />
                    )}

                    {extendChart && projectedOffset != null && targetKg != null && (
                      <SvgText x={xForOffset(projectedOffset)} y={yForKg(targetKg) + 4} fontSize={11} textAnchor="middle">
                        {TARGET_ICON}
                      </SvgText>
                    )}

                    {xTickPositions.map(({ iso, x }, i) => (
                      <Fragment key={iso}>
                        <Line x1={x} y1={baselineY} x2={x} y2={baselineY + 5} stroke={colors.border} strokeWidth={1} />
                        <SvgText
                          x={x}
                          y={baselineY + 16}
                          fontSize={10}
                          fill={colors.textDim}
                          textAnchor={xLabelRotation > 0 ? 'end' : 'middle'}
                          transform={xLabelRotation > 0 ? `rotate(${-xLabelRotation} ${x} ${baselineY + 16})` : undefined}
                        >
                          {xTickLabels[i]}
                        </SvgText>
                      </Fragment>
                    ))}

                    {targetDateTickX != null && targetDateLabel != null && (
                      <SvgText
                        x={targetDateTickX}
                        y={baselineY + 16}
                        fontSize={10}
                        fontWeight="700"
                        fill={TARGET_COLOR}
                        textAnchor={xLabelRotation > 0 ? 'end' : 'middle'}
                        transform={xLabelRotation > 0 ? `rotate(${-xLabelRotation} ${targetDateTickX} ${baselineY + 16})` : undefined}
                      >
                        {targetDateLabel}
                      </SvgText>
                    )}
                  </Svg>
                )}
              </View>
            </View>
          </View>

          <View style={styles.list}>
            {monthGroups.map((group) => (
              <View key={group.key} style={styles.monthGroup}>
                <View style={styles.monthHeader}>
                  <Text style={styles.monthLabel}>{group.label}</Text>
                  <Text style={styles.monthAvg}>avg {formatValue(group.avgKg, displayUnit)} {displayUnit}</Text>
                </View>
                {group.items.map(({ entry: e, delta }) => (
                  <Pressable key={e.id} style={styles.row} onPress={() => openEdit(e)}>
                    <View style={styles.rowDate}>
                      <Text style={styles.rowDateText}>{formatRowDate(e.date)}</Text>
                    </View>
                    <Text style={styles.rowValue}>{e.value.toFixed(1)} {e.unit}</Text>
                    <Text style={[styles.rowDelta, deltaColor(delta)]}>
                      {delta == null ? '' : formatDelta(delta, displayUnit)}
                    </Text>
                    {e.note ? <MaterialIcons name="notes" size={14} color={colors.textDim} /> : null}
                  </Pressable>
                ))}
              </View>
            ))}
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
        visible={selectedEntry != null}
        onClose={() => setSelectedEntry(null)}
        entry={selectedEntry}
        deltaVsPrevKg={selectedDeltaPrevKg}
        deltaVsWeekKg={selectedDeltaWeekKg}
      />
    </View>
  );
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
  headerTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
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
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.md,
    gap: spacing.xs,
    alignItems: 'center',
  },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  statUnit: { fontSize: font.sm, fontWeight: '500', color: colors.textMuted },
  targetCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.md,
    gap: spacing.xs,
  },
  targetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  targetHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  targetFlagIcon: { fontSize: 16 },
  targetTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  targetHint: { color: colors.textDim, fontSize: font.sm, lineHeight: 18 },
  targetValueRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  targetValue: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  statusBadgeOn: { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: colors.success },
  statusBadgeOff: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: colors.danger },
  statusBadgeText: { fontSize: 10, fontWeight: '700', color: colors.text },
  prognosisText: { color: colors.textMuted, fontSize: font.sm },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  chartHeaderIcon: { fontSize: 16 },
  chartHeaderTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  rangeRow: { flexDirection: 'row', gap: spacing.xs },
  rangeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  rangeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  rangeChipText: { fontSize: font.sm, fontWeight: '600', color: colors.textMuted },
  rangeChipTextActive: { color: '#fff' },
  rangeChipIcon: { flex: 0.7 },
  chartSubtitle: { color: colors.textDim, fontSize: font.sm },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendText: { color: colors.textMuted, fontSize: font.sm },
  chartBody: { flexDirection: 'row', gap: spacing.xs },
  yAxis: { width: Y_AXIS_WIDTH, height: PLOT_HEIGHT, position: 'relative' },
  plotArea: { flex: 1, height: TOTAL_SVG_HEIGHT },
  axisLabel: { color: colors.textDim, fontSize: 10, textTransform: 'uppercase' },
  axisLabelAbs: {
    position: 'absolute',
    right: 0,
    width: Y_AXIS_WIDTH,
    textAlign: 'right',
    transform: [{ translateY: -6 }],
  },
  list: { gap: spacing.lg },
  monthGroup: { gap: spacing.xs },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  monthLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  monthAvg: { color: colors.textDim, fontSize: font.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surface2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rowDate: { width: 72 },
  rowDateText: { color: colors.textMuted, fontSize: font.sm },
  rowValue: { flex: 1, color: colors.text, fontSize: font.md, fontWeight: '600' },
  rowDelta: { fontSize: font.sm, fontWeight: '500', minWidth: 64, textAlign: 'right' },
});
