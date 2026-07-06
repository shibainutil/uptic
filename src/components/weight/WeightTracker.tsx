import { Fragment, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, LayoutChangeEvent } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Rect, Line, Circle, Text as SvgText } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { useWeightEntries, useWeightTarget } from '../../store/weightStore';
import { WeightEntryModal } from './WeightEntryModal';
import { WeightTargetModal } from './WeightTargetModal';
import { WeightDateFilterModal, type DateRange } from './WeightDateFilterModal';
import { colors, spacing, font, radius } from '../../theme';
import { fromISO, diffDays, todayISO } from '../../lib/schedule';
import { fitWeightTrend, trendKgAt, prognose, humanizeDaysAway, type Prognosis } from '../../lib/weightTrend';
import { toKg, fromKg, type WeightEntry, type WeightUnit } from '../../types/weight';

const PLOT_HEIGHT = 130;
const PLOT_Y_PAD = 20;
const PLOT_X_PAD = 10;
const CHART_POINTS = 20;
const Y_AXIS_WIDTH = 48;
const GRID_STEP = 5; // y-axis tick spacing, in the displayed unit
const DEFAULT_MAX = 100; // y-axis max fallback (displayed unit) when nothing is logged yet
const TREND_COLOR = colors.textMuted;
const TARGET_COLOR = '#F59E0B';
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

function formatDelta(deltaKg: number, unit: WeightUnit): string {
  const v = fromKg(Math.abs(deltaKg), unit);
  const sign = deltaKg > 0 ? '+' : deltaKg < 0 ? '−' : '';
  return `${sign}${v.toFixed(1)} ${unit}`;
}

function prognosisText(p: Prognosis): string {
  switch (p.kind) {
    case 'reached': return 'Target reached!';
    case 'onTrack': return `On track — around ${formatAxisDate(p.date)} (${humanizeDaysAway(p.daysAway)})`;
    case 'notTrending': return 'Not currently trending toward this target.';
    case 'insufficientData': return 'Log a few more entries to see a prognosis.';
  }
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

  const filteredAscending = dateFilter
    ? ascending.filter((e) => e.date >= dateFilter.from && e.date <= dateFilter.to)
    : ascending;

  // Trend, prognosis, and the weekly rate all derive from the filtered window, so they
  // reflect whatever date range the user is currently viewing.
  const fit = fitWeightTrend(filteredAscending);
  const targetKg = target ? toKg(target.value, target.unit) : null;
  const prognosis: Prognosis | null = targetKg != null ? prognose(fit, targetKg, todayISO()) : null;
  const weeklyRateKg = fit ? fit.slopeKgPerDay * 7 : null;

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

  const barWidth = chartEntries.length
    ? Math.min(9, Math.max(3, ((plotWidth - PLOT_X_PAD * 2) / chartEntries.length) * 0.35))
    : 5;
  const baselineY = PLOT_HEIGHT - PLOT_Y_PAD;

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
                <MaterialIcons name="flag" size={16} color={TARGET_COLOR} />
                <Text style={styles.targetTitle}>Target</Text>
              </View>
              <Pressable onPress={() => setTargetModalOpen(true)} hitSlop={8}>
                <MaterialIcons name={target ? 'edit' : 'add-circle-outline'} size={18} color={colors.accent} />
              </Pressable>
            </View>
            {!target ? (
              <Text style={styles.targetHint}>Set a target weight to see a prognosis based on your current trend.</Text>
            ) : (
              <>
                <Text style={styles.targetValue}>{formatValue(targetKg!, displayUnit)} <Text style={styles.statUnit}>{displayUnit}</Text></Text>
                {prognosis && <Text style={styles.prognosisText}>{prognosisText(prognosis)}</Text>}
              </>
            )}
          </View>

          <View style={styles.chartCard}>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: colors.accent }]} />
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
              <View style={styles.yAxis}>
                {ticksKg.map((v, i) => (
                  <Text key={i} style={[styles.axisLabel, styles.axisLabelAbs, { top: yForKg(v) }]}>
                    {formatValue(v, displayUnit)}{displayUnit}
                  </Text>
                ))}
              </View>

              <View style={styles.plotArea} onLayout={onPlotLayout}>
                {plotWidth > 0 && chartEntries.length > 0 && (
                  <Svg width={plotWidth} height={PLOT_HEIGHT}>
                    {ticksKg.map((v, i) => (
                      <Line key={i} x1={0} y1={yForKg(v)} x2={plotWidth} y2={yForKg(v)} stroke={colors.border} strokeWidth={1} />
                    ))}

                    {targetKg != null && (
                      <Line
                        x1={0} y1={yForKg(targetKg)} x2={plotWidth} y2={yForKg(targetKg)}
                        stroke={TARGET_COLOR} strokeWidth={1.5} strokeDasharray="5,4"
                      />
                    )}

                    {extendChart && (
                      <Line
                        x1={xForOffset(lastOffset)} y1={PLOT_Y_PAD} x2={xForOffset(lastOffset)} y2={baselineY}
                        stroke={colors.border} strokeWidth={1} strokeDasharray="2,3"
                      />
                    )}

                    {chartEntries.map((e, i) => {
                      const offset = diffDays(e.date, chartBaseISO);
                      const x = xForOffset(offset);
                      const kg = barKgValues[i];
                      const y = yForKg(kg);
                      return (
                        <Fragment key={e.id}>
                          <Rect
                            x={x - barWidth / 2}
                            y={y}
                            width={barWidth}
                            height={Math.max(2, baselineY - y)}
                            rx={2}
                            fill={colors.accent}
                          />
                          <SvgText x={x} y={y - 4} fontSize={8} fill={colors.textMuted} textAnchor="middle">
                            {formatValue(kg, displayUnit)}
                          </SvgText>
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
                      <Circle cx={xForOffset(projectedOffset)} cy={yForKg(targetKg)} r={5} fill={TARGET_COLOR} />
                    )}

                    {targetKg != null && (
                      <SvgText x={4} y={yForKg(targetKg) - 4} fontSize={9} fill={TARGET_COLOR}>
                        {formatValue(targetKg, displayUnit)}{displayUnit}
                      </SvgText>
                    )}
                  </Svg>
                )}
              </View>
            </View>

            <View style={styles.xAxisRow}>
              <Text style={styles.axisLabel}>{chartBaseISO ? formatAxisDate(chartBaseISO) : ''}</Text>
              <Text style={styles.axisLabel}>
                {extendChart && projectedOffset != null
                  ? formatAxisDate((prognosis as { date: string }).date)
                  : chartEntries.length > 0 ? formatAxisDate(chartEntries[chartEntries.length - 1].date) : ''}
              </Text>
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
    </View>
  );
}

function deltaColor(delta: number | null) {
  if (delta == null || Math.abs(delta) < 0.05) return { color: colors.textMuted };
  return { color: delta > 0 ? colors.danger : colors.success };
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
  targetTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  targetHint: { color: colors.textDim, fontSize: font.sm, lineHeight: 18 },
  targetValue: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  prognosisText: { color: colors.textMuted, fontSize: font.sm },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface2,
    padding: spacing.md,
    gap: spacing.sm,
  },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 12, height: 8, borderRadius: 2 },
  legendLine: { width: 12, height: 2, borderRadius: 1 },
  legendText: { color: colors.textMuted, fontSize: font.sm },
  chartBody: { flexDirection: 'row', gap: spacing.xs },
  yAxis: { width: Y_AXIS_WIDTH, height: PLOT_HEIGHT, position: 'relative' },
  plotArea: { flex: 1, height: PLOT_HEIGHT },
  xAxisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: Y_AXIS_WIDTH + spacing.xs },
  axisLabel: { color: colors.textDim, fontSize: 9 },
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
