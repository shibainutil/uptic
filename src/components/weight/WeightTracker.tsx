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
import { fitWeightTrend, trendKgAt, prognose, type Prognosis } from '../../lib/weightTrend';
import { toKg, fromKg, formatDelta, deltaColor, type WeightEntry, type WeightUnit } from '../../types/weight';

const PLOT_HEIGHT = 130;
const PLOT_Y_PAD = 20;
const PLOT_X_PAD = 10;
const XAXIS_HEIGHT = 46; // reserved below the plot for rotated month/15th tick labels
const TOTAL_SVG_HEIGHT = PLOT_HEIGHT + XAXIS_HEIGHT;
const CHART_POINTS = 20;
const Y_AXIS_WIDTH = 34;
const Y_AXIS_TITLE_WIDTH = 16;
const GRID_STEP = 5; // y-axis tick spacing, in the displayed unit
const DEFAULT_MAX = 100; // y-axis max fallback (displayed unit) when nothing is logged yet
const TREND_COLOR = colors.textMuted;
const TARGET_COLOR = '#F59E0B';
const TARGET_FLAG = '🏁';
const PROJECTION_CAP_DAYS = 240; // don't visually extend the chart more than ~8 months out

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

function formatTickLabel(iso: string): string {
  const d = fromISO(iso);
  const month = d.toLocaleDateString(undefined, { month: 'short' });
  return `${d.getDate()} ${month}`.toUpperCase();
}

/** Ticks at the 1st and 15th of every month within [startISO, endISO]. */
function monthTicks(startISO: string, endISO: string): string[] {
  if (startISO > endISO) return [];
  const start = fromISO(startISO);
  const ticks: string[] = [];
  let y = start.getFullYear();
  let m = start.getMonth();
  let guard = 0;
  while (guard++ < 600) {
    const first = toISO(new Date(y, m, 1));
    const fifteenth = toISO(new Date(y, m, 15));
    if (first > endISO) break;
    if (first >= startISO) ticks.push(first);
    if (fifteenth >= startISO && fifteenth <= endISO) ticks.push(fifteenth);
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return ticks;
}

type TargetProjection =
  | { kind: 'reached' }
  | { kind: 'projected'; date: string }
  | { kind: 'never' };

/** Projects when the target would be hit at the current weekly rate — independent of the
 * chart's own regression-based prognosis, per the simpler "weekly average" rule. */
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

export function WeightTracker() {
  const { user } = useAuth();
  const { entries, loaded, upsert, remove } = useWeightEntries(user?.uid);
  const { target, save: saveTarget, clear: clearTarget } = useWeightTarget(user?.uid);
  const [modalOpen, setModalOpen] = useState(false);
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WeightEntry | undefined>(undefined);
  const [dateFilter, setDateFilter] = useState<DateRange | null>(null);
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

  const filteredAscending = dateFilter
    ? ascending.filter((e) => e.date >= dateFilter.from && e.date <= dateFilter.to)
    : ascending;

  // Trend, prognosis, and the weekly rate all derive from the filtered window, so they
  // reflect whatever date range the user is currently viewing.
  const fit = fitWeightTrend(filteredAscending);
  const targetKg = target ? toKg(target.value, target.unit) : null;
  const prognosis: Prognosis | null = targetKg != null ? prognose(fit, targetKg, todayISO()) : null;
  const weeklyRateKg = fit ? fit.slopeKgPerDay * 7 : null;

  // With a deadline set, on/off track compares the projected reach date against it;
  // otherwise it falls back to the simple "losing weight" rule.
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
  const chartEntries = filteredAscending.slice(-CHART_POINTS);
  const chartBaseISO = chartEntries[0]?.date;
  const lastOffset = chartEntries.length ? diffDays(chartEntries[chartEntries.length - 1].date, chartBaseISO) : 0;

  const extendChart = !!(prognosis?.kind === 'onTrack' && prognosis.daysAway <= PROJECTION_CAP_DAYS);
  const projectedOffset = extendChart ? diffDays((prognosis as { date: string }).date, chartBaseISO) : null;
  const domainEndOffset = Math.max(lastOffset, projectedOffset ?? 0, 1);

  function xForOffset(offset: number): number {
    if (chartEntries.length <= 1) return plotWidth / 2;
    const usable = plotWidth - PLOT_X_PAD * 2;
    return PLOT_X_PAD + (offset / domainEndOffset) * usable;
  }

  const barKgValues = chartEntries.map((e) => toKg(e.value, e.unit));

  const trendAtBaseKg = fit && chartBaseISO ? trendKgAt(fit, chartBaseISO) : null;
  const trendEndISO = extendChart ? (prognosis as { date: string }).date : chartEntries[chartEntries.length - 1]?.date;
  const trendAtEndKg = fit && trendEndISO ? trendKgAt(fit, trendEndISO) : null;

  // Y-axis: top is the highest logged value (or the target, if that's higher; 100 as a
  // sane default with no data yet). Ticks are equidistant GRID_STEP-unit steps, and the
  // bottom tick is always at least one full step below the lowest logged value/target,
  // so both ends land cleanly on the same 5-unit grid.
  const stepKg = toKg(GRID_STEP, displayUnit);
  const maxLoggedKg = barKgValues.length ? Math.max(...barKgValues) : toKg(DEFAULT_MAX, displayUnit);
  const minLoggedKg = barKgValues.length ? Math.min(...barKgValues) : 0;
  const maxWithTargetKg = targetKg != null ? Math.max(maxLoggedKg, targetKg) : maxLoggedKg;
  const minWithTargetKg = targetKg != null ? Math.min(minLoggedKg, targetKg) : minLoggedKg;
  const maxKg = Math.ceil(maxWithTargetKg / stepKg) * stepKg;
  const minKg = Math.floor((minWithTargetKg - stepKg) / stepKg) * stepKg;
  const range = maxKg - minKg;

  const tickCount = Math.round(range / stepKg);
  const ticksKg = Array.from({ length: tickCount + 1 }, (_, i) => maxKg - i * stepKg);

  function yForKg(kg: number): number {
    const usable = PLOT_HEIGHT - PLOT_Y_PAD * 2;
    return PLOT_Y_PAD + (1 - (kg - minKg) / range) * usable;
  }

  const baselineY = PLOT_HEIGHT - PLOT_Y_PAD;
  const linePoints = chartEntries.map((e, i) => ({
    x: xForOffset(diffDays(e.date, chartBaseISO)),
    y: yForKg(barKgValues[i]),
  }));

  // The target label sits above whichever point it's most relevant to: the projected
  // reach-date marker if the trend gets there, otherwise the latest logged point.
  const targetLabelX = extendChart && projectedOffset != null
    ? xForOffset(projectedOffset)
    : xForOffset(lastOffset);

  // ── X-axis: ticks at the 1st/15th of each month, rotated only as much as needed to
  // avoid overlap given the current timeframe (dynamic — recomputed on every filter change).
  const xTicksRaw = chartBaseISO && trendEndISO ? monthTicks(chartBaseISO, trendEndISO) : [];
  const xTicks = xTicksRaw.length ? xTicksRaw : (chartBaseISO && trendEndISO ? [chartBaseISO, trendEndISO] : []);
  const xTickPositions = xTicks.map((iso) => ({ iso, x: xForOffset(diffDays(iso, chartBaseISO)) }));
  const xTickLabels = xTicks.map(formatTickLabel);
  const longestLabelLen = xTickLabels.reduce((m, l) => Math.max(m, l.length), 0);
  const estLabelWidth = longestLabelLen * 5.5;
  const estLabelHeight = 10;
  const minTickGapPx = xTickPositions.length > 1
    ? Math.min(...xTickPositions.slice(1).map((t, i) => t.x - xTickPositions[i].x))
    : Infinity;

  function xLabelFootprint(deg: number): number {
    const rad = (deg * Math.PI) / 180;
    return estLabelWidth * Math.cos(rad) + estLabelHeight * Math.sin(rad);
  }
  let xLabelRotation = 0;
  for (const deg of [0, 30, 45, 60, 75, 90]) {
    xLabelRotation = deg;
    if (xLabelFootprint(deg) <= minTickGapPx) break;
  }

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
                <Text style={styles.targetFlagIcon}>{TARGET_FLAG}</Text>
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
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: colors.accent }]} />
                <Text style={styles.legendText}>Weight</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: TREND_COLOR }]} />
                <Text style={styles.legendText}>Trend</Text>
              </View>
              {target && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendLine, { backgroundColor: TARGET_COLOR }]} />
                  <Text style={styles.legendText}>Target</Text>
                </View>
              )}
            </View>

            <View style={styles.chartBody}>
              <View style={styles.yAxisTitleWrap}>
                <Text style={styles.yAxisTitle}>Weight in {displayUnit}</Text>
              </View>

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

                    {targetKg != null && (
                      <Line
                        x1={0} y1={yForKg(targetKg)} x2={plotWidth} y2={yForKg(targetKg)}
                        stroke={TARGET_COLOR} strokeWidth={1.5} strokeDasharray="1,5" strokeLinecap="round"
                      />
                    )}

                    {extendChart && (
                      <Line
                        x1={xForOffset(lastOffset)} y1={PLOT_Y_PAD} x2={xForOffset(lastOffset)} y2={baselineY}
                        stroke={colors.border} strokeWidth={1} strokeDasharray="2,3"
                      />
                    )}

                    {linePoints.length > 1 && (
                      <Polyline
                        points={linePoints.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={colors.accent}
                        strokeWidth={2}
                      />
                    )}

                    {chartEntries.map((e, i) => {
                      const { x, y } = linePoints[i];
                      const kg = barKgValues[i];
                      const isMax = Math.abs(kg - maxLoggedKg) < 0.001;
                      const isMin = Math.abs(kg - minLoggedKg) < 0.001;
                      const isLatest = i === chartEntries.length - 1;
                      const labelColor = isMax ? colors.danger : isMin ? colors.success : isLatest ? colors.accent : null;
                      return (
                        <Fragment key={e.id}>
                          <Circle cx={x} cy={y} r={isLatest ? 4 : 2.5} fill={colors.accent} />
                          <Circle cx={x} cy={y} r={12} fill="transparent" onPress={() => openDetail(e)} />
                          {labelColor && (
                            <SvgText x={x} y={y - 6} fontSize={8} fill={labelColor} fontWeight="700" textAnchor="middle">
                              {formatValue(kg, displayUnit)}
                            </SvgText>
                          )}
                        </Fragment>
                      );
                    })}

                    {fit && trendAtBaseKg != null && trendAtEndKg != null && (
                      <Line
                        x1={xForOffset(0)} y1={yForKg(trendAtBaseKg)}
                        x2={xForOffset(domainEndOffset)} y2={yForKg(trendAtEndKg)}
                        stroke={TREND_COLOR} strokeWidth={2} strokeDasharray="1,5" strokeLinecap="round"
                      />
                    )}

                    {extendChart && projectedOffset != null && targetKg != null && (
                      <SvgText x={xForOffset(projectedOffset)} y={yForKg(targetKg) + 5} fontSize={14} textAnchor="middle">
                        {TARGET_FLAG}
                      </SvgText>
                    )}

                    {targetKg != null && (
                      <SvgText x={targetLabelX} y={yForKg(targetKg) - 6} fontSize={9} fill={TARGET_COLOR} textAnchor="middle">
                        {formatValue(targetKg, displayUnit)}
                      </SvgText>
                    )}

                    {xTickPositions.map(({ iso, x }, i) => (
                      <Fragment key={iso}>
                        <Line x1={x} y1={baselineY} x2={x} y2={baselineY + 4} stroke={colors.border} strokeWidth={1} />
                        <SvgText
                          x={x}
                          y={baselineY + 14}
                          fontSize={9}
                          fill={colors.textDim}
                          textAnchor={xLabelRotation > 0 ? 'end' : 'middle'}
                          transform={xLabelRotation > 0 ? `rotate(${-xLabelRotation} ${x} ${baselineY + 14})` : undefined}
                        >
                          {xTickLabels[i]}
                        </SvgText>
                      </Fragment>
                    ))}
                  </Svg>
                )}
              </View>
            </View>
          </View>

          <View style={styles.filterRow}>
            <Pressable onPress={() => setFilterModalOpen(true)} style={styles.filterRowBtn}>
              <MaterialIcons name="filter-list" size={16} color={dateFilter ? colors.accent : colors.textMuted} />
              <Text style={[styles.filterRowBtnText, dateFilter && { color: colors.accent }]}>
                {dateFilter ? 'Edit filter' : 'Filter by date'}
              </Text>
            </Pressable>
            {dateFilter && (
              <Pressable onPress={() => setDateFilter(null)} style={styles.filterRowChip} hitSlop={8}>
                <Text style={styles.filterRowChipText}>{formatAxisDate(dateFilter.from)} – {formatAxisDate(dateFilter.to)}</Text>
                <MaterialIcons name="close" size={14} color={colors.textMuted} />
              </Pressable>
            )}
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
        value={dateFilter}
        onApply={setDateFilter}
        onClear={() => setDateFilter(null)}
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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  filterRowBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.xs },
  filterRowBtnText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  filterRowChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterRowChipText: { color: colors.textMuted, fontSize: font.sm },
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
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendLine: { width: 12, height: 2, borderRadius: 1 },
  legendText: { color: colors.textMuted, fontSize: font.sm },
  chartBody: { flexDirection: 'row', gap: spacing.xs },
  yAxisTitleWrap: { width: Y_AXIS_TITLE_WIDTH, height: PLOT_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  yAxisTitle: {
    width: PLOT_HEIGHT,
    textAlign: 'center',
    color: colors.textDim,
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    transform: [{ rotate: '-90deg' }],
  },
  yAxis: { width: Y_AXIS_WIDTH, height: PLOT_HEIGHT, position: 'relative' },
  plotArea: { flex: 1, height: TOTAL_SVG_HEIGHT },
  axisLabel: { color: colors.textDim, fontSize: 9, textTransform: 'uppercase' },
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
