import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { ScrollView, Text, TouchableOpacity, View, FlatList, Dimensions, Switch, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useStatsSummary, type StatsTimeframe } from '../lib/detection/stats';
import { formatDetectionTimestamp } from '../lib/detection/formatters';
import { useDetectionHistory } from '../lib/detection/detectionHistory';
import { trackTelemetryEvent } from '../lib/services/telemetry';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { getTrustedSourceForSender } from '../lib/trustedSources';

const SECTION_WRAPPER =
  'rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900';
const SECTION_TITLE =
  'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const STATS_TIMEFRAME_OPTIONS: StatsTimeframe[] = ['24h', '7d', '30d', 'all'];

export default function StatsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [timeframe, setTimeframe] = useState<StatsTimeframe>('7d');
  const statsSummary = useStatsSummary(timeframe);
  const { merged: detectionHistory } = useDetectionHistory();
  const numberFormatter = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const timeframeLabel = t(`dashboard.stats.timeframes.${timeframe}`);

  // Filters (re-using alert-style thresholds)
  const [severityFilters, setSeverityFilters] = useState<Array<'high' | 'medium' | 'low'>>([]);
  const [channelFilters, setChannelFilters] = useState<Array<'sms' | 'whatsapp' | 'email'>>([]);
  const [trustedOnly, setTrustedOnly] = useState(false);
  const listRef = useRef<FlatList<any> | null>(null);
  const [activeCard, setActiveCard] = useState(0);
  const CARD_WIDTH = Math.min(260, Dimensions.get('window').width * 0.65);

  const toggleSeverity = useCallback((s: 'high' | 'medium' | 'low') => {
    setSeverityFilters((prev) => {
      const next = prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s];
      return next.sort();
    });
  }, []);

  const toggleChannel = useCallback((c: 'sms' | 'whatsapp' | 'email') => {
    setChannelFilters((prev) => {
      const next = prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c];
      return next.sort();
    });
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleTimeframeChange = useCallback(
    (next: StatsTimeframe) => {
      if (next === timeframe) {
        return;
      }

      setTimeframe(next);
      trackTelemetryEvent('stats.timeframe_changed', {
        timeframe: next,
      });
    },
    [timeframe]
  );

    // handle card snapping index
    const onCardsMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x || 0;
      const index = Math.round(x / (CARD_WIDTH + 12));
      setActiveCard(index);
    }, []);

    const clearFilters = useCallback(() => {
      setSeverityFilters([]);
      setChannelFilters([]);
      setTrustedOnly(false);
    }, []);

  const trendLabel = useMemo(() => {
    if (!statsSummary.trend) {
      return t('dashboard.stats.trend.flat');
    }

    if (statsSummary.trend.direction === 'flat') {
      return t('dashboard.stats.trend.flat');
    }

    return t(`dashboard.stats.trend.${statsSummary.trend.direction}`, {
      value: statsSummary.trend.value,
    });
  }, [statsSummary.trend, t]);

  const windowedRecords = useMemo(() => {
    // Build a simple list of numeric scores over time for the chosen timeframe
    const now = Date.now();
    const durationMap: Record<StatsTimeframe, number> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      all: 365 * 24 * 60 * 60 * 1000,
    };
    const windowMs = durationMap[timeframe];
    return detectionHistory
      .map((r) => ({ t: new Date(r.detectedAt).getTime(), s: r.result.score }))
      .filter((r) => !Number.isNaN(r.t) && now - r.t <= windowMs)
      .sort((a, b) => a.t - b.t);
  }, [detectionHistory, timeframe]);

  // Helpers for severity mapping (same as alerts screen)
  const severityMatchers = useMemo(
    () => ({
      high: (score: number) => score >= 0.75,
      medium: (score: number) => score >= 0.6 && score < 0.75,
      low: (score: number) => score >= 0.5 && score < 0.6,
    }),
    []
  );

  const filteredHistory = useMemo(() => {
    const now = Date.now();
    const durationMap: Record<StatsTimeframe, number> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      all: 365 * 24 * 60 * 60 * 1000,
    };
    const windowMs = durationMap[timeframe];

    return detectionHistory.filter((r) => {
      const tms = new Date(r.detectedAt).getTime();
      if (Number.isNaN(tms)) return false;
      if (now - tms > windowMs) return false;

      if (channelFilters.length && !channelFilters.includes(r.result.message.channel as any)) {
        return false;
      }

      const score = typeof r.result.score === 'number' ? r.result.score : 0;

      // If no explicit severity filters are active, hide safe (<0.5)
      if (severityFilters.length === 0) {
        if (score < 0.5) return false;
      } else {
        const ok = severityFilters.some((sev) => severityMatchers[sev](score));
        if (!ok) return false;
      }

      if (trustedOnly) {
        const trusted = Boolean(getTrustedSourceForSender(r.result.message.sender, r.result.message.channel));
        if (!trusted) return false;
      }

      return true;
    });
  }, [detectionHistory, timeframe, channelFilters, severityFilters, trustedOnly, severityMatchers]);

  const Sparkline = ({ values }: { values: { t: number; s: number }[] }) => {
    const w = Math.min(Dimensions.get('window').width - 96, 280);
    const h = 64; // larger sparkline for stronger visuals
    if (!values || values.length === 0) {
      return (
        <Svg width={w} height={h}>
          <Polyline points={`0,${h / 2} ${w},${h / 2}`} fill="none" stroke="#cbd5e1" strokeWidth={1} />
        </Svg>
      );
    }

    const minS = Math.min(...values.map((v) => v.s), 0);
    const maxS = Math.max(...values.map((v) => v.s), 1);

    const points = values
      .map((v, i) => {
        const x = (i / (values.length - 1 || 1)) * w;
        const y = h - ((v.s - minS) / (maxS - minS || 1)) * h;
        return `${x},${y}`;
      })
      .join(' ');

    const last = values[values.length - 1];

    return (
      <Svg width={w} height={h}>
        <Polyline points={points} fill="none" stroke="#2563eb" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={w - 8} cy={h - ((last.s - minS) / (maxS - minS || 1)) * h} r={4} fill="#1e40af" />
      </Svg>
    );
  };

  // Aggregate distribution for charting
  const distribution = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0, safe: 0 } as Record<string, number>;
    filteredHistory.forEach((r) => {
      const s = typeof r.result.score === 'number' ? r.result.score : 0;
      if (s >= 0.75) counts.high += 1;
      else if (s >= 0.6) counts.medium += 1;
      else if (s >= 0.5) counts.low += 1;
      else counts.safe += 1;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return { counts, total };
  }, [filteredHistory]);

  const TrendLine = ({ values }: { values: { t: number; s: number }[] }) => {
    // Build simple aggregated buckets for the timeframe
  const w = Math.min(Dimensions.get('window').width - 48, 520);
  const h = 96; // make trend area a bit taller for clarity
    if (!values || values.length === 0) {
      return (
        <Svg width={w} height={h}>
          <Polyline points={`0,${h / 2} ${w},${h / 2}`} fill="none" stroke="#cbd5e1" strokeWidth={1} />
        </Svg>
      );
    }

    const buckets = 20;
    const bucketSize = Math.max(1, Math.ceil(values.length / buckets));
    const bucketAverages = [] as number[];
    for (let i = 0; i < values.length; i += bucketSize) {
      const slice = values.slice(i, i + bucketSize);
      const avg = slice.reduce((a, b) => a + b.s, 0) / slice.length;
      bucketAverages.push(avg);
    }

    const minS = Math.min(...bucketAverages, 0);
    const maxS = Math.max(...bucketAverages, 1);

    const points = bucketAverages
      .map((s, i) => {
        const x = (i / (bucketAverages.length - 1 || 1)) * w;
        const y = h - ((s - minS) / (maxS - minS || 1)) * h;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <Svg width={w} height={h}>
        <Polyline points={points} fill="none" stroke="#2563eb" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  };

  const formatDetectedAt = useCallback(
    (value: string) => formatDetectionTimestamp(value, i18n.language),
    [i18n.language]
  );

  const cards = useMemo(
    () => [
      {
        key: 'scanned',
        label: t('dashboard.stats.messagesScanned'),
        value: numberFormatter.format(statsSummary.totals.scanned),
        icon: 'chart-line',
        spark: windowedRecords,
      },
      {
        key: 'threats',
        label: t('dashboard.stats.threatsBlocked'),
        value: numberFormatter.format(statsSummary.totals.threats),
        icon: 'shield-alert',
        spark: windowedRecords.filter((v) => v.s >= 0.6),
      },
      {
        key: 'safe',
        label: t('dashboard.stats.safeMessages'),
        value: numberFormatter.format(statsSummary.totals.safe),
        icon: 'shield-check-outline',
        spark: windowedRecords.filter((v) => v.s < 0.6),
      },
    ],
    [numberFormatter, statsSummary, t, windowedRecords]
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      {/* Header (match nested settings header style) */}
      <View className="border-b border-slate-200/70 bg-slate-50 px-6 pb-6 pt-6 dark:border-slate-800 dark:bg-slate-950">
        <View className="relative flex-row items-center justify-center">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={handleBack}
            activeOpacity={0.7}
            className="absolute left-0 rounded-full bg-slate-200 p-2 dark:bg-slate-800">
            <MaterialCommunityIcons name="chevron-left" size={28} color="#2563eb" />
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t('dashboard.stats.title')}
          </Text>
        </View>
        <Text className="mt-4 text-base text-slate-600 dark:text-slate-400">
          {t('dashboard.stats.subtitle', { defaultValue: t('dashboard.stats.since', { timeframe: timeframeLabel }) })}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="flex-col gap-6">
          <View className={SECTION_WRAPPER}>
            <Text className={SECTION_TITLE}>{t('dashboard.stats.overview')}</Text>
            <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t('dashboard.stats.since', { timeframe: timeframeLabel })}
            </Text>

            <View className="mt-4 flex-row items-center gap-3">
              {STATS_TIMEFRAME_OPTIONS.map((option) => {
                const selected = option === timeframe;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => handleTimeframeChange(option)}
                    activeOpacity={0.85}
                    className={`rounded-full px-4 py-2 ${selected ? 'bg-blue-600' : 'bg-slate-100 dark:bg-slate-800'}`}>
                    <Text className={`text-xs font-semibold uppercase tracking-wide ${selected ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                      {t(`dashboard.stats.timeframes.${option}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="mt-4">
              <FlatList
                ref={listRef}
                data={cards}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.key}
                contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: (Dimensions.get('window').width - CARD_WIDTH) / 2 }}
                ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
                snapToInterval={CARD_WIDTH + 12}
                decelerationRate="fast"
                snapToAlignment="start"
                onMomentumScrollEnd={onCardsMomentumEnd}
                renderItem={({ item }) => (
                  <View style={{ width: CARD_WIDTH }} className="rounded-3xl border border-transparent bg-white p-5 shadow-lg dark:bg-slate-900/90 dark:border-slate-800">
                    <View className="mb-3 h-12 w-12 items-center justify-center rounded-3xl bg-blue-50 dark:bg-blue-500/20">
                      <MaterialCommunityIcons name={item.icon as any} size={22} color="#1e40af" />
                    </View>
                    <Text className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                      {item.value}
                    </Text>
                    <Text className="mt-1 text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {item.label}
                    </Text>
                    <View className="mt-4">{<Sparkline values={item.spark} />}</View>
                  </View>
                )}
              />

              {/* pagination dots for the carousel */}
              <View className="mt-3 flex-row items-center justify-center gap-2">
                {cards.map((c, i) => (
                  <View key={c.key} style={{ width: i === activeCard ? 10 : 6, height: 6, borderRadius: 6 }} className={`${i === activeCard ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`} />
                ))}
              </View>
            </View>

            <Text className="mt-4 text-xs text-slate-500 dark:text-slate-400">{trendLabel}</Text>
          </View>

          {/* Filters & distribution */}
          <View className={SECTION_WRAPPER}>
            <View className="flex-row items-center justify-between">
              <Text className={SECTION_TITLE}>{t('dashboard.stats.filters')}</Text>
              <View className="flex-row items-center gap-3">
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.stats.trustedOnly')}</Text>
                  <Switch value={trustedOnly} onValueChange={setTrustedOnly} thumbColor={trustedOnly ? '#2563eb' : undefined} />
                </View>
                {(severityFilters.length || channelFilters.length || trustedOnly) ? (
                  <TouchableOpacity onPress={clearFilters} className="rounded-full border px-3 py-1 bg-slate-50 dark:bg-slate-800">
                    <Text className="text-xs text-slate-600 dark:text-slate-300">{t('common.clear')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View className="mt-4">
              <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('dashboard.alerts.severityLabel')}
              </Text>
              <View className="mt-3 flex-row items-center gap-2">
                <TouchableOpacity onPress={() => setSeverityFilters([])} className={`rounded-full border px-4 py-2 ${severityFilters.length === 0 ? 'border-blue-500 bg-blue-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                  <Text className={`${severityFilters.length === 0 ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-300'}`}>{t('dashboard.alerts.severity.all')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleSeverity('high')} className={`rounded-full border px-4 py-2 ${severityFilters.includes('high') ? 'border-rose-500 bg-rose-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                  <Text className={`${severityFilters.includes('high') ? 'text-rose-600 dark:text-rose-200' : 'text-slate-500 dark:text-slate-300'}`}>{t('dashboard.alerts.severity.high')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleSeverity('medium')} className={`rounded-full border px-4 py-2 ${severityFilters.includes('medium') ? 'border-amber-500 bg-amber-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                  <Text className={`${severityFilters.includes('medium') ? 'text-amber-600 dark:text-amber-200' : 'text-slate-500 dark:text-slate-300'}`}>{t('dashboard.alerts.severity.medium')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleSeverity('low')} className={`rounded-full border px-4 py-2 ${severityFilters.includes('low') ? 'border-blue-500 bg-blue-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                  <Text className={`${severityFilters.includes('low') ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-300'}`}>{t('dashboard.alerts.severity.low')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View className="mt-4">
              <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('dashboard.alerts.channelLabel')}
              </Text>
              <View className="mt-3 flex-row items-center gap-2">
                <TouchableOpacity onPress={() => setChannelFilters([])} className={`rounded-full border px-4 py-2 ${channelFilters.length === 0 ? 'border-blue-500 bg-blue-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                  <Text className={`${channelFilters.length === 0 ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-300'}`}>{t('dashboard.alerts.channels.all')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleChannel('sms')} className={`rounded-full border px-4 py-2 ${channelFilters.includes('sms') ? 'border-blue-500 bg-blue-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                  <Text className={`${channelFilters.includes('sms') ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-300'}`}>{t('dashboard.mockDetection.channels.sms')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleChannel('whatsapp')} className={`rounded-full border px-4 py-2 ${channelFilters.includes('whatsapp') ? 'border-blue-500 bg-blue-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                  <Text className={`${channelFilters.includes('whatsapp') ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-300'}`}>{t('dashboard.mockDetection.channels.whatsapp')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleChannel('email')} className={`rounded-full border px-4 py-2 ${channelFilters.includes('email') ? 'border-blue-500 bg-blue-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                  <Text className={`${channelFilters.includes('email') ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-300'}`}>{t('dashboard.mockDetection.channels.email')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View className="mt-6">
              <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('dashboard.stats.distribution')}</Text>
              <View className="mt-3">
                {/* Simple horizontal distribution bars */}
                <View className="flex-row items-center gap-3">
                  <View style={{ flex: 1 }}>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.alerts.severity.high')}</Text>
                      <Text className="text-xs font-semibold text-slate-700 dark:text-slate-200">{distribution.counts.high}</Text>
                    </View>
                    <View className="mt-1 h-2 w-full rounded-full bg-rose-100 dark:bg-rose-500/20">
                      <View style={{ width: `${(distribution.counts.high / distribution.total) * 100}%` }} className="h-2 rounded-full bg-rose-500" />
                    </View>
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.alerts.severity.medium')}</Text>
                      <Text className="text-xs font-semibold text-slate-700 dark:text-slate-200">{distribution.counts.medium}</Text>
                    </View>
                    <View className="mt-1 h-2 w-full rounded-full bg-amber-100 dark:bg-amber-500/20">
                      <View style={{ width: `${(distribution.counts.medium / distribution.total) * 100}%` }} className="h-2 rounded-full bg-amber-500" />
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View className="mt-6">
              <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('dashboard.stats.trend')}</Text>
              <View className="mt-3">
                <TrendLine values={windowedRecords} />
              </View>
            </View>
          </View>

          <View className={SECTION_WRAPPER}>
            <Text className={SECTION_TITLE}>{t('dashboard.stats.messagesScanned')}</Text>
            <View className="mt-4 flex-col gap-3">
              {statsSummary.breakdown.map((entry) => (
                <View
                  key={entry.channel}
                  className="flex-row items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t(`dashboard.mockDetection.channels.${entry.channel}`)}
                    </Text>
                    <Text className="text-xs text-slate-500 dark:text-slate-400">
                      {t('dashboard.stats.messagesScanned')}: {numberFormatter.format(entry.scanned)}
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <View className="flex-row items-center gap-1">
                      <MaterialCommunityIcons name="shield-alert" size={16} color="#f97316" />
                      <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {numberFormatter.format(entry.threats)}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <MaterialCommunityIcons name="shield-check-outline" size={16} color="#22c55e" />
                      <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {numberFormatter.format(entry.safe)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
              {!statsSummary.breakdown.length ? (
                <Text className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.alerts.empty')}</Text>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
