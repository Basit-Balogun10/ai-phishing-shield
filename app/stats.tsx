import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, FlatList, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useStatsSummary, type StatsTimeframe } from '../lib/detection/stats';
import { formatDetectionTimestamp } from '../lib/detection/formatters';
import { useDetectionHistory } from '../lib/detection/detectionHistory';
import { trackTelemetryEvent } from '../lib/services/telemetry';
import Svg, { Polyline, Circle } from 'react-native-svg';

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

  const recentDetections = useMemo(() => detectionHistory.slice(0, 8), [detectionHistory]);

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

  const Sparkline = ({ values }: { values: { t: number; s: number }[] }) => {
    const w = Math.min(Dimensions.get('window').width - 96, 260);
    const h = 48;
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
        <Polyline points={points} fill="none" stroke="#60a5fa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={w - 6} cy={h - ((last.s - minS) / (maxS - minS || 1)) * h} r={3} fill="#2563eb" />
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
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="gap-6">
          <View className="flex-row items-center justify-between">
            <TouchableOpacity
              onPress={handleBack}
              activeOpacity={0.85}
              className="flex-row items-center gap-2 rounded-full border border-slate-200 px-4 py-2 dark:border-slate-700">
              <MaterialCommunityIcons name="arrow-left" size={18} color="#2563eb" />
              <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                {t('common.back')}
              </Text>
            </TouchableOpacity>
            <Text className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {t('dashboard.stats.title')}
            </Text>
          </View>

          <View className={SECTION_WRAPPER}>
            <Text className={SECTION_TITLE}>{t('dashboard.stats.title')}</Text>
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
                    className={`rounded-full px-4 py-2 ${
                      selected ? 'bg-blue-600' : 'bg-slate-100 dark:bg-slate-800'
                    }`}>
                    <Text
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        selected ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                      }`}>
                      {t(`dashboard.stats.timeframes.${option}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="mt-4">
              <FlatList
                data={cards}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.key}
                contentContainerStyle={{ paddingVertical: 4 }}
                ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
                renderItem={({ item }) => (
                  <View className="w-64 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                    <View className="mb-3 h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/20">
                      <MaterialCommunityIcons name={item.icon as any} size={20} color="#2563eb" />
                    </View>
                    <Text className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {item.value}
                    </Text>
                    <Text className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {item.label}
                    </Text>
                    <View className="mt-3">{<Sparkline values={item.spark} />}</View>
                  </View>
                )}
              />
            </View>

            <Text className="mt-4 text-xs text-slate-500 dark:text-slate-400">{trendLabel}</Text>
          </View>

          <View className={SECTION_WRAPPER}>
            <Text className={SECTION_TITLE}>{t('dashboard.stats.messagesScanned')}</Text>
            <View className="mt-4 space-y-3">
              {statsSummary.breakdown.map((entry) => (
                <View
                  key={entry.channel}
                  className="flex-row items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t(`dashboard.mockDetection.channels.${entry.channel}`)}
                    </Text>
                    <Text className="text-xs text-slate-500 dark:text-slate-400">
                      {t('dashboard.stats.messagesScanned')}:{' '}
                      {numberFormatter.format(entry.scanned)}
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
                      <MaterialCommunityIcons
                        name="shield-check-outline"
                        size={16}
                        color="#22c55e"
                      />
                      <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {numberFormatter.format(entry.safe)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
              {!statsSummary.breakdown.length ? (
                <Text className="text-xs text-slate-500 dark:text-slate-400">
                  {t('dashboard.alerts.empty')}
                </Text>
              ) : null}
            </View>
          </View>

          {/* <View className={SECTION_WRAPPER}>
            <Text className={SECTION_TITLE}>{t('dashboard.alerts.title')}</Text>
            <View className="mt-4 space-y-3">
              {recentDetections.map((item) => (
                <View
                  key={item.recordId}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 pr-4">
                      <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {item.result.message.sender}
                      </Text>
                      <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {formatDetectedAt(item.detectedAt)}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
                        {t(`dashboard.mockDetection.channels.${item.result.message.channel}`)}
                      </Text>
                      <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t('dashboard.mockDetection.scoreLabel', {
                          score: Math.round(item.result.score * 100),
                        })}
                      </Text>
                    </View>
                  </View>
                  <Text
                    className="mt-2 text-sm text-slate-600 dark:text-slate-200"
                    numberOfLines={3}>
                    “{item.result.message.body}”
                  </Text>
                </View>
              ))}
              {!recentDetections.length ? (
                <Text className="text-xs text-slate-500 dark:text-slate-400">
                  {t('dashboard.alerts.empty')}
                </Text>
              ) : null}
            </View>
          </View> */}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
