import { useMemo, useSyncExternalStore } from 'react';

import { detectionHistoryStore } from './detectionHistory';
import { analyzeMessage, getMockMessages, type DetectionResult } from './mockDetection';

export type StatsTimeframe = '24h' | '7d' | '30d' | 'all';

type StatsWindow = {
  start: Date | null;
  end: Date;
};

export type StatsTotals = {
  scanned: number;
  threats: number;
  safe: number;
};

type TrendDirection = 'up' | 'down' | 'flat';

export type StatsTrend = {
  direction: TrendDirection;
  value: number;
};

export type ChannelBreakdown = {
  channel: DetectionResult['message']['channel'];
  scanned: number;
  threats: number;
  safe: number;
};

type ComputedStats = {
  totals: StatsTotals;
  trend: StatsTrend | null;
  breakdown: ChannelBreakdown[];
  window: StatsWindow;
};

type RecordEntry = {
  id: string;
  timestamp: string;
  channel: DetectionResult['message']['channel'];
  score: number;
  source: 'historical' | 'simulated';
};

type DetectionSnapshot = ReturnType<typeof detectionHistoryStore.getSnapshot>;

const TIMEFRAME_WINDOWS: Record<Exclude<StatsTimeframe, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const SCORE_THRESHOLD = 0.6;

const buildRecords = (snapshot: DetectionSnapshot) => {
  const baseline: RecordEntry[] = getMockMessages().map((message) => {
    const analysis = analyzeMessage(message);
    return {
      id: message.id,
      timestamp: message.receivedAt,
      channel: message.channel,
      score: analysis.score,
      source: 'historical' as const,
    } satisfies RecordEntry;
  });

  const simulated: RecordEntry[] = snapshot.simulated.map((record) => ({
    id: record.recordId,
    timestamp: record.detectedAt,
    channel: record.result.message.channel,
    score: record.result.score,
    source: 'simulated' as const,
  }));

  return { baseline, simulated };
};

const toWindow = (timeframe: StatsTimeframe, now: Date): StatsWindow => {
  if (timeframe === 'all') {
    return { start: null, end: now };
  }

  const duration = TIMEFRAME_WINDOWS[timeframe];
  return {
    start: new Date(now.getTime() - duration),
    end: now,
  } satisfies StatsWindow;
};

const isWithinWindow = (value: string, window: StatsWindow) => {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return false;
  }

  if (window.start && timestamp < window.start) {
    return false;
  }

  return timestamp <= window.end;
};

const filterByWindow = (records: RecordEntry[], window: StatsWindow) => {
  return records.filter((record) => isWithinWindow(record.timestamp, window));
};

const mergeRecords = (baseline: RecordEntry[], simulated: RecordEntry[]): RecordEntry[] => {
  return [...baseline, ...simulated];
};

const computeTotals = (records: RecordEntry[]): StatsTotals => {
  const scanned = records.length;
  const threats = records.filter((record) => record.score >= SCORE_THRESHOLD).length;
  const safe = Math.max(scanned - threats, 0);

  return { scanned, threats, safe } satisfies StatsTotals;
};

const computeBreakdown = (records: RecordEntry[]): ChannelBreakdown[] => {
  const map = new Map<ChannelBreakdown['channel'], ChannelBreakdown>();

  for (const record of records) {
    const existing = map.get(record.channel) ?? {
      channel: record.channel,
      scanned: 0,
      threats: 0,
      safe: 0,
    };

    existing.scanned += 1;
    if (record.score >= SCORE_THRESHOLD) {
      existing.threats += 1;
    } else {
      existing.safe += 1;
    }

    map.set(record.channel, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.threats - a.threats);
};

const computeTrend = (
  records: RecordEntry[],
  timeframe: StatsTimeframe,
  now: Date
): StatsTrend | null => {
  if (timeframe === 'all') {
    return null;
  }

  const duration = TIMEFRAME_WINDOWS[timeframe];
  const currentWindow = toWindow(timeframe, now);
  const previousWindow: StatsWindow = {
    start: new Date(currentWindow.start!.getTime() - duration),
    end: currentWindow.start!,
  };

  const currentThreats = filterByWindow(records, currentWindow).filter(
    (record) => record.score >= SCORE_THRESHOLD
  ).length;
  const previousThreats = filterByWindow(records, previousWindow).filter(
    (record) => record.score >= SCORE_THRESHOLD
  ).length;

  if (previousThreats === 0 && currentThreats === 0) {
    return { direction: 'flat', value: 0 };
  }

  if (previousThreats === 0) {
    return { direction: 'up', value: 100 };
  }

  const delta = currentThreats - previousThreats;
  const percent = Math.round((Math.abs(delta) / previousThreats) * 100);

  if (percent === 0) {
    return { direction: 'flat', value: 0 };
  }

  return {
    direction: delta >= 0 ? 'up' : 'down',
    value: percent,
  } satisfies StatsTrend;
};

const computeStats = (
  timeframe: StatsTimeframe,
  now: Date,
  snapshot: DetectionSnapshot
): ComputedStats => {
  const { baseline, simulated } = buildRecords(snapshot);
  const combined = mergeRecords(baseline, simulated);
  const window = toWindow(timeframe, now);
  const windowedRecords = filterByWindow(combined, window);

  return {
    totals: computeTotals(windowedRecords),
    trend: computeTrend(combined, timeframe, now),
    breakdown: computeBreakdown(windowedRecords),
    window,
  } satisfies ComputedStats;
};

export const useStatsSummary = (timeframe: StatsTimeframe): ComputedStats => {
  const snapshot = useSyncExternalStore(
    detectionHistoryStore.subscribe,
    detectionHistoryStore.getSnapshot,
    detectionHistoryStore.getSnapshot
  );

  return useMemo(() => computeStats(timeframe, new Date(), snapshot), [timeframe, snapshot]);
};

export const getStatsSummary = (
  timeframe: StatsTimeframe,
  now: Date = new Date()
): ComputedStats => {
  return computeStats(timeframe, now, detectionHistoryStore.getSnapshot());
};
