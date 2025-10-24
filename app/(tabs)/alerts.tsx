import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppModal } from '../../components/AppModal';
import { type DetectionRecord, useDetectionHistory } from '../../lib/detection/detectionHistory';
import { type DetectionFeedbackStatus, useDetectionFeedback } from '../../lib/detection/feedback';
import { submitDetectionFeedback } from '../../lib/services/alertFeedback';
import { trackTelemetryEvent } from '../../lib/services/telemetry';
import { getTrustedSourceForSender } from '../../lib/trustedSources';

// Map severity string to UI styles. Prefer using `risk.severity` from the
// detection object (emitted by the inference wrapper). If severity is
// unavailable, callers may fall back to numeric score mapping.
const SEVERITY_STYLE: Record<string, { badge: string; text: string; iconColor: string }> = {
  high: {
    badge: 'bg-rose-100 dark:bg-rose-500/20',
    text: 'text-rose-700 dark:text-rose-200',
    iconColor: '#dc2626',
  },
  medium: {
    badge: 'bg-amber-100 dark:bg-amber-500/20',
    text: 'text-amber-700 dark:text-amber-200',
    iconColor: '#d97706',
  },
  low: {
    badge: 'bg-blue-100 dark:bg-blue-500/20',
    text: 'text-blue-700 dark:text-blue-200',
    iconColor: '#2563eb',
  },
  safe: {
    badge: 'bg-slate-100 dark:bg-slate-800/20',
    text: 'text-slate-600 dark:text-slate-400',
    iconColor: '#64748b',
  },
};

const getSeverityColorBySeverity = (sev?: string) => {
  if (!sev) return SEVERITY_STYLE.safe;
  const key = String(sev).toLowerCase();
  return SEVERITY_STYLE[key] ?? SEVERITY_STYLE.safe;
};

// Fallback numeric -> severity mapping in case `risk.severity` is missing.
const numericSeverityFromScore = (score: number) => {
  if (score >= 0.75) return 'high';
  if (score >= 0.6) return 'medium';
  if (score >= 0.5) return 'low';
  return 'safe';
};

const TIMEFRAME_THRESHOLDS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;

type SeverityFilter = 'high' | 'medium' | 'low';
type ChannelFilter = 'sms' | 'whatsapp' | 'email';
type TimeframeFilter = '24h' | '7d' | '30d';

const SEVERITY_ORDER: Record<SeverityFilter, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const CHANNEL_ORDER: Record<ChannelFilter, number> = {
  sms: 0,
  whatsapp: 1,
  email: 2,
};

const TIMEFRAME_ORDER: Record<TimeframeFilter, number> = {
  '24h': 0,
  '7d': 1,
  '30d': 2,
};

export default function AlertsScreen() {
  const { t } = useTranslation();
  const { merged: detectionHistory } = useDetectionHistory();
  const [selectedDetection, setSelectedDetection] = useState<DetectionRecord | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [severityFilters, setSeverityFilters] = useState<SeverityFilter[]>([]);
  const [channelFilters, setChannelFilters] = useState<ChannelFilter[]>([]);
  const [timeframeFilters, setTimeframeFilters] = useState<TimeframeFilter[]>([]);
  const toggleSeverityFilter = useCallback((value: SeverityFilter) => {
    setSeverityFilters((prev) => {
      const next = prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value];
      return next.sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b]);
    });
  }, []);

  const toggleChannelFilter = useCallback((value: ChannelFilter) => {
    setChannelFilters((prev) => {
      const next = prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value];
      return next.sort((a, b) => CHANNEL_ORDER[a] - CHANNEL_ORDER[b]);
    });
  }, []);

  const toggleTimeframeFilter = useCallback((value: TimeframeFilter) => {
    setTimeframeFilters((prev) => {
      const next = prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value];
      return next.sort((a, b) => TIMEFRAME_ORDER[a] - TIMEFRAME_ORDER[b]);
    });
  }, []);
  const [trustedOnly, setTrustedOnly] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const severityOptions = useMemo(
    () => [
      { key: 'all' as const, label: t('dashboard.recentAlerts.severity.all') },
      { key: 'high' as const, label: t('dashboard.recentAlerts.severity.high') },
      { key: 'medium' as const, label: t('dashboard.recentAlerts.severity.medium') },
      { key: 'low' as const, label: t('dashboard.recentAlerts.severity.low') },
    ],
    [t]
  );

  const channelOptions = useMemo(
    () => [
      { key: 'all' as const, label: t('dashboard.recentAlerts.channels.all') },
      { key: 'sms' as const, label: t('dashboard.mockDetection.channels.sms') },
      { key: 'whatsapp' as const, label: t('dashboard.mockDetection.channels.whatsapp') },
      { key: 'email' as const, label: t('dashboard.mockDetection.channels.email') },
    ],
    [t]
  );

  const timeframeOptions = useMemo(
    () => [
      {
        key: 'all' as const,
        label: t('dashboard.recentAlerts.timeframe.all', {
          defaultValue: 'Any time',
        }),
      },
      {
        key: '24h' as const,
        label: t('dashboard.recentAlerts.timeframe.24h', {
          defaultValue: 'Last 24 hours',
        }),
      },
      {
        key: '7d' as const,
        label: t('dashboard.recentAlerts.timeframe.7d', {
          defaultValue: 'Last 7 days',
        }),
      },
      {
        key: '30d' as const,
        label: t('dashboard.recentAlerts.timeframe.30d', {
          defaultValue: 'Last 30 days',
        }),
      },
    ],
    [t]
  );

  const { ready: feedbackReady, feedback } = useDetectionFeedback(
    selectedDetection?.recordId ?? null
  );

  const normalizeText = useCallback((value: string) => {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const trimmed = searchInput.trim();
      setQuery(trimmed ? normalizeText(trimmed) : '');
    }, 250);

    return () => clearTimeout(timeout);
  }, [normalizeText, searchInput]);

  useEffect(() => {
    setFeedbackError(null);
    setFeedbackSubmitting(false);
  }, [selectedDetection?.recordId]);

  // Match wrapper metadata thresholds: high >= 0.75, medium >= 0.60, low >= 0.50 && <0.60
  const severityMatchers: Record<SeverityFilter, (score: number) => boolean> = useMemo(
    () => ({
      high: (score: number) => score >= 0.75,
      medium: (score: number) => score >= 0.6 && score < 0.75,
      low: (score: number) => score >= 0.5 && score < 0.6,
    }),
    []
  );

  const channelLabelMap = useMemo(
    () => ({
      sms: normalizeText(t('dashboard.mockDetection.channels.sms')),
      whatsapp: normalizeText(t('dashboard.mockDetection.channels.whatsapp')),
      email: normalizeText(t('dashboard.mockDetection.channels.email')),
    }),
    [normalizeText, t]
  );

  const formatDetectedAt = useCallback((value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }, []);

  const filteredDetections = useMemo(() => {
    const now = Date.now();

    return detectionHistory.filter((record) => {
      const isTrustedSource = Boolean(
        getTrustedSourceForSender(record.result.message.sender, record.result.message.channel)
      );

      if (trustedOnly && !isTrustedSource) {
        return false;
      }

      // By default (no explicit severity filters active) hide 'safe' alerts
      // where the wrapper set risk.severity === 'safe' or numeric score < 0.5.
      if (severityFilters.length === 0) {
        const sev = record.result?.risk?.severity;
        if (sev === 'safe') {
          return false;
        }
        const s = typeof record.result?.score === 'number' ? record.result.score : 0;
        if (s < 0.5) {
          return false;
        }
      }

      if (timeframeFilters.length) {
        const detectedAtTime = new Date(record.detectedAt).getTime();
        if (Number.isNaN(detectedAtTime)) {
          return false;
        }

        const isWithinAnyWindow = timeframeFilters.some((filter) => {
          const windowMs = TIMEFRAME_THRESHOLDS[filter];
          return now - detectedAtTime <= windowMs;
        });

        if (!isWithinAnyWindow) {
          return false;
        }
      }

      if (channelFilters.length && !channelFilters.includes(record.result.message.channel)) {
        return false;
      }

      if (severityFilters.length) {
        const matchesSeverity = severityFilters.some((filter) =>
          severityMatchers[filter](record.result.score)
        );
        if (!matchesSeverity) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      const sender = normalizeText(record.result.message.sender);
      const body = normalizeText(record.result.message.body);
      const channelLabel = channelLabelMap[record.result.message.channel] ?? '';
      const matches = (record.result.matches ?? [])
        .map((match) => (match.label ? normalizeText(match.label) : ''))
        .filter(Boolean);
      const detectedAtText = normalizeText(formatDetectedAt(record.detectedAt));

      const haystack = [sender, body, channelLabel, detectedAtText, ...matches];
      return haystack.some((value) => value.includes(query));
    });
  }, [
    channelFilters,
    channelLabelMap,
    detectionHistory,
    formatDetectedAt,
    normalizeText,
    query,
    severityFilters,
    severityMatchers,
    timeframeFilters,
    trustedOnly,
  ]);

  const filtersTelemetryPayload = useMemo(
    () => ({
      source: 'all' as const,
      severity: severityFilters,
      channel: channelFilters,
      timeframe: timeframeFilters,
      trustedOnly,
    }),
    [channelFilters, severityFilters, timeframeFilters, trustedOnly]
  );

  const appliedFiltersSummary = useMemo(() => {
    const parts: string[] = [];

    if (severityFilters.length) {
      severityFilters.forEach((filter) => {
        parts.push(t(`dashboard.recentAlerts.severity.${filter}`));
      });
    }

    if (channelFilters.length) {
      channelFilters.forEach((filter) => {
        parts.push(t(`dashboard.mockDetection.channels.${filter}`));
      });
    }

    if (timeframeFilters.length) {
      timeframeFilters.forEach((filter) => {
        parts.push(
          t(`dashboard.recentAlerts.timeframe.${filter}`, {
            defaultValue:
              filter === '24h' ? 'Last 24 hours' : filter === '7d' ? 'Last 7 days' : 'Last 30 days',
          })
        );
      });
    }

    if (trustedOnly) {
      parts.push(t('dashboard.recentAlerts.trustedOnlyBadge'));
    }

    return parts.filter(Boolean).join(' • ');
  }, [channelFilters, severityFilters, t, timeframeFilters, trustedOnly]);

  const hasActiveFilters =
    severityFilters.length > 0 ||
    channelFilters.length > 0 ||
    timeframeFilters.length > 0 ||
    trustedOnly;

  const handleFeedback = useCallback(
    async (status: DetectionFeedbackStatus) => {
      if (!selectedDetection || feedbackSubmitting) {
        return;
      }

      if (feedback?.status === status) {
        return;
      }

      try {
        setFeedbackSubmitting(true);
        setFeedbackError(null);
        await submitDetectionFeedback({
          record: selectedDetection,
          status,
        });
      } catch (error) {
        if (__DEV__) {
          console.warn('[alerts] Failed to submit feedback', error);
        }
        setFeedbackError(t('dashboard.recentAlerts.feedback.error'));
      } finally {
        setFeedbackSubmitting(false);
      }
    },
    [feedback?.status, feedbackSubmitting, selectedDetection, t]
  );

  const previousQueryRef = useRef(query);
  const initializedSearchTelemetry = useRef(false);
  const previousFiltersRef = useRef(filtersTelemetryPayload);

  const selectedDetectionTrusted = useMemo(() => {
    if (!selectedDetection) {
      return false;
    }

    return Boolean(
      getTrustedSourceForSender(
        selectedDetection.result.message.sender,
        selectedDetection.result.message.channel
      )
    );
  }, [selectedDetection]);

  const selectedSeverityStyles = useMemo(() => {
    if (!selectedDetection) {
      return null;
    }
    const sev = (selectedDetection.result as any)?.risk?.severity as string | undefined;
    const s =
      typeof (selectedDetection.result as any)?.score === 'number'
        ? (selectedDetection.result as any).score
        : 0;
    const chosen = sev ?? numericSeverityFromScore(s);
    return getSeverityColorBySeverity(chosen);
  }, [selectedDetection]);

  useEffect(() => {
    const hasQueryChanged = previousQueryRef.current !== query;
    previousQueryRef.current = query;

    if (!initializedSearchTelemetry.current) {
      initializedSearchTelemetry.current = true;
      return;
    }

    if (!hasQueryChanged) {
      return;
    }

    trackTelemetryEvent('alerts.search_changed', {
      queryLength: query.length,
      filters: filtersTelemetryPayload,
    } as any);
  }, [filtersTelemetryPayload, query]);

  useEffect(() => {
    const previous = previousFiltersRef.current;
    const hasChanged =
      previous.severity !== filtersTelemetryPayload.severity ||
      previous.channel !== filtersTelemetryPayload.channel ||
      previous.timeframe !== filtersTelemetryPayload.timeframe ||
      previous.trustedOnly !== filtersTelemetryPayload.trustedOnly;

    previousFiltersRef.current = filtersTelemetryPayload;

    if (!hasChanged) {
      return;
    }

    trackTelemetryEvent('alerts.filter_changed', filtersTelemetryPayload as any);
  }, [filtersTelemetryPayload]);

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-6 pb-3 pt-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {t('dashboard.recentAlerts.title')}
          </Text>
          <TouchableOpacity
            onPress={() => setIsFilterModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.recentAlerts.openFilters', {
              defaultValue: 'Open alert filters',
            })}
            className="h-11 w-11 items-center justify-center rounded-full bg-blue-500/10 dark:bg-blue-400/10">
            <MaterialCommunityIcons name="tune-variant" size={22} color="#2563eb" />
          </TouchableOpacity>
        </View>
        <Text className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {t('dashboard.recentAlerts.subtitle')}
        </Text>
      </View>

      <View className="px-6 pb-5">
        <View className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <MaterialCommunityIcons name="magnify" size={22} color="#64748b" />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder={t('dashboard.recentAlerts.searchPlaceholder')}
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 text-base text-slate-900 dark:text-slate-100"
          />
          {searchInput.length ? (
            <TouchableOpacity
              onPress={() => setSearchInput('')}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear')}
              className="rounded-full bg-slate-100 p-2 dark:bg-slate-800">
              <MaterialCommunityIcons name="close" size={16} color="#64748b" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View className="mt-3 flex-row items-center justify-between">
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            {appliedFiltersSummary ||
              t('dashboard.recentAlerts.noFiltersApplied', {
                defaultValue: 'No filters applied',
              })}
          </Text>
          <TouchableOpacity
            onPress={() => setIsFilterModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.recentAlerts.editFilters', {
              defaultValue: 'Adjust alert filters',
            })}
            className="flex-row items-center gap-1">
            <MaterialCommunityIcons name="tune-variant" size={16} color="#2563eb" />
            <Text className="text-xs font-semibold text-blue-600 dark:text-blue-300">
              {t('dashboard.recentAlerts.editFilters', { defaultValue: 'Adjust filters' })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 32 }}>
        {filteredDetections.length === 0 ? (
          <View className="items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
            <MaterialCommunityIcons name="check-circle" size={40} color="#22c55e" />
            <Text className="mt-4 text-center text-sm text-slate-500 dark:text-slate-300">
              {query || hasActiveFilters
                ? t('dashboard.recentAlerts.emptyWithFilters', {
                    filters: [
                      query ? `“${searchInput.trim()}”` : null,
                      ...severityFilters.map((filter) =>
                        t(`dashboard.recentAlerts.severity.${filter}`)
                      ),
                      ...channelFilters.map((filter) =>
                        t(`dashboard.mockDetection.channels.${filter}`)
                      ),
                      ...timeframeFilters.map((filter) =>
                        t(`dashboard.recentAlerts.timeframe.${filter}`, {
                          defaultValue:
                            filter === '24h'
                              ? 'Last 24 hours'
                              : filter === '7d'
                                ? 'Last 7 days'
                                : 'Last 30 days',
                        })
                      ),
                      trustedOnly ? t('dashboard.recentAlerts.trustedOnlyBadge') : null,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  })
                : t('dashboard.recentAlerts.empty')}
            </Text>
          </View>
        ) : (
          filteredDetections.map((entry) => {
            const recSev = (entry.result as any)?.risk?.severity as string | undefined;
            const recScore =
              typeof (entry.result as any)?.score === 'number' ? (entry.result as any).score : 0;
            const chosenSev = recSev ?? numericSeverityFromScore(recScore);
            const { badge, text: severityText } = getSeverityColorBySeverity(chosenSev);
            const primaryMatch = entry.result.matches[0];
            const isTrustedSource = Boolean(
              getTrustedSourceForSender(entry.result.message.sender, entry.result.message.channel)
            );

            return (
              <TouchableOpacity
                key={entry.recordId}
                onPress={() => setSelectedDetection(entry)}
                activeOpacity={0.85}
                className="mb-3 rounded-2xl border border-slate-200/70 bg-white/90 px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 pr-2">
                    <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {entry.result.message.sender}
                    </Text>
                    <Text
                      className="mt-2 text-sm text-slate-500 dark:text-slate-300"
                      numberOfLines={2}>
                      {entry.result.message.body}
                    </Text>
                  </View>
                  <View className={`rounded-full px-3 py-1 ${badge}`}>
                    <Text
                      className={`text-xs font-semibold uppercase tracking-wide ${severityText}`}>
                      {t('dashboard.mockDetection.scoreLabel', {
                        score: Math.round(entry.result.score * 100),
                      })}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 flex-row flex-wrap items-center gap-2">
                  <View className="flex-row items-center gap-1">
                    <MaterialCommunityIcons name="clock-outline" size={14} color="#64748b" />
                    <Text className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {formatDetectedAt(entry.detectedAt)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <MaterialCommunityIcons name="message-text-outline" size={14} color="#2563eb" />
                    <Text className="text-xs font-medium text-blue-600 dark:text-blue-300">
                      {t(`dashboard.mockDetection.channels.${entry.result.message.channel}`)}
                    </Text>
                  </View>
                  {primaryMatch ? (
                    <View className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800/60">
                      <Text className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {primaryMatch.label}
                      </Text>
                    </View>
                  ) : null}
                  {isTrustedSource ? (
                    <View className="rounded-full bg-emerald-100 px-3 py-1 dark:bg-emerald-500/20">
                      <Text className="text-xs font-medium text-emerald-600 dark:text-emerald-200">
                        {t('dashboard.recentAlerts.trustedBadge')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <AppModal
        isVisible={isFilterModalVisible}
        onClose={() => setIsFilterModalVisible(false)}
        testID="alerts-filters-modal">
        <View className="flex-1 justify-end">
          <View className="max-h-[80vh] w-full rounded-t-3xl bg-white dark:bg-slate-900">
            <View className="flex-row items-start justify-between border-b border-slate-200 px-6 pb-4 pt-5 dark:border-slate-800">
              <View className="flex-1 pr-4">
                <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t('dashboard.recentAlerts.filtersTitle', { defaultValue: 'Filters' })}
                </Text>
                <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {hasActiveFilters
                    ? appliedFiltersSummary
                    : t('dashboard.recentAlerts.noFiltersApplied', {
                        defaultValue: 'No filters applied',
                      })}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setSeverityFilters([]);
                  setChannelFilters([]);
                  setTimeframeFilters([]);
                  setTrustedOnly(false);
                }}
                accessibilityRole="button"
                disabled={!hasActiveFilters}
                className={`rounded-full px-3 py-1 ${
                  hasActiveFilters
                    ? 'bg-blue-500/10'
                    : 'bg-slate-200/40 opacity-40 dark:bg-slate-800/40'
                }`}>
                <Text
                  className={`text-xs font-semibold ${
                    hasActiveFilters
                      ? 'text-blue-600 dark:text-blue-300'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}>
                  {t('dashboard.recentAlerts.clearFilters', { defaultValue: 'Clear all' })}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="px-6" contentContainerStyle={{ paddingBottom: 24 }}>
              <View className="mt-6">
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.recentAlerts.severityLabel', { defaultValue: 'Severity' })}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 24 }}
                  className="mt-3">
                  <View className="flex-row items-center gap-2">
                    {severityOptions.map((option) => {
                      const isActive =
                        option.key === 'all'
                          ? severityFilters.length === 0
                          : severityFilters.includes(option.key);
                      return (
                        <TouchableOpacity
                          key={option.key}
                          onPress={() =>
                            option.key === 'all'
                              ? setSeverityFilters([])
                              : toggleSeverityFilter(option.key)
                          }
                          activeOpacity={0.85}
                          className={`rounded-full border px-4 py-2 ${
                            isActive
                              ? 'border-blue-500 bg-blue-500/10'
                              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                          }`}>
                          <Text
                            className={`text-sm font-medium ${
                              isActive
                                ? 'text-blue-600 dark:text-blue-300'
                                : 'text-slate-500 dark:text-slate-300'
                            }`}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              <View className="mt-6">
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.recentAlerts.channelLabel', { defaultValue: 'Channel' })}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 24 }}
                  className="mt-3">
                  <View className="flex-row items-center gap-2">
                    {channelOptions.map((option) => {
                      const isActive =
                        option.key === 'all'
                          ? channelFilters.length === 0
                          : channelFilters.includes(option.key);
                      return (
                        <TouchableOpacity
                          key={option.key}
                          onPress={() =>
                            option.key === 'all'
                              ? setChannelFilters([])
                              : toggleChannelFilter(option.key)
                          }
                          activeOpacity={0.85}
                          className={`rounded-full border px-4 py-2 ${
                            isActive
                              ? 'border-blue-500 bg-blue-500/10'
                              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                          }`}>
                          <Text
                            className={`text-sm font-medium ${
                              isActive
                                ? 'text-blue-600 dark:text-blue-300'
                                : 'text-slate-500 dark:text-slate-300'
                            }`}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              <View className="mt-6">
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.recentAlerts.timeframeLabel', { defaultValue: 'Detected within' })}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 24 }}
                  className="mt-3">
                  <View className="flex-row items-center gap-2">
                    {timeframeOptions.map((option) => {
                      const isActive =
                        option.key === 'all'
                          ? timeframeFilters.length === 0
                          : timeframeFilters.includes(option.key as TimeframeFilter);
                      return (
                        <TouchableOpacity
                          key={option.key}
                          onPress={() =>
                            option.key === 'all'
                              ? setTimeframeFilters([])
                              : toggleTimeframeFilter(option.key as TimeframeFilter)
                          }
                          activeOpacity={0.85}
                          className={`rounded-full border px-4 py-2 ${
                            isActive
                              ? 'border-blue-500 bg-blue-500/10'
                              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                          }`}>
                          <Text
                            className={`text-sm font-medium ${
                              isActive
                                ? 'text-blue-600 dark:text-blue-300'
                                : 'text-slate-500 dark:text-slate-300'
                            }`}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              <View className="mt-6">
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.recentAlerts.trustedToggle.label')}
                </Text>
                <View className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-4">
                      <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {t('dashboard.recentAlerts.trustedToggle.label')}
                      </Text>
                      <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t('dashboard.recentAlerts.trustedToggle.description')}
                      </Text>
                    </View>
                    <Switch
                      value={trustedOnly}
                      onValueChange={setTrustedOnly}
                      trackColor={{ false: '#cbd5f5', true: '#2563eb' }}
                      thumbColor={trustedOnly ? '#1e40af' : '#f8fafc'}
                      ios_backgroundColor="#cbd5f5"
                    />
                  </View>
                </View>
              </View>
            </ScrollView>

            <View className="border-t border-slate-200 px-6 py-4 dark:border-slate-800">
              <TouchableOpacity
                onPress={() => setIsFilterModalVisible(false)}
                activeOpacity={0.85}
                className="items-center justify-center rounded-full bg-blue-600 py-3 dark:bg-blue-500">
                <Text className="text-sm font-semibold text-white">
                  {t('dashboard.recentAlerts.applyFilters', { defaultValue: 'Done' })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </AppModal>

      <AppModal
        isVisible={Boolean(selectedDetection)}
        onClose={() => setSelectedDetection(null)}
        testID="alerts-detection-detail-modal">
        <View className="flex-1 justify-end">
          <View className="max-h-[90vh] w-full rounded-t-3xl bg-white dark:bg-slate-900">
            {selectedDetection ? (
              <>
                <View className="flex-row items-center justify-between border-b border-slate-200 px-6 pb-4 pt-5 dark:border-slate-800">
                  <View className="flex-1 pr-4">
                    <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {selectedDetection.result.message.sender}
                    </Text>
                    <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {formatDetectedAt(selectedDetection.detectedAt)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedDetection(null)}
                    accessibilityRole="button"
                    className="h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                    <MaterialCommunityIcons name="close" size={18} color="#475569" />
                  </TouchableOpacity>
                </View>

                <ScrollView className="px-6" contentContainerStyle={{ paddingBottom: 32 }}>
                  <View className="mt-6 space-y-6">
                    <View className="flex-row flex-wrap items-center gap-3">
                      {selectedSeverityStyles ? (
                        <View className={`rounded-full px-3 py-1 ${selectedSeverityStyles.badge}`}>
                          <Text
                            className={`text-xs font-semibold uppercase tracking-wide ${selectedSeverityStyles.text}`}>
                            {t('dashboard.mockDetection.scoreLabel', {
                              score: Math.round(selectedDetection.result.score * 100),
                            })}
                          </Text>
                        </View>
                      ) : null}
                      <View className="rounded-full bg-blue-500/10 px-3 py-1 dark:bg-blue-500/20">
                        <Text className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-200">
                          {t(
                            `dashboard.mockDetection.channels.${selectedDetection.result.message.channel}`
                          )}
                        </Text>
                      </View>
                      {selectedDetection.source === 'simulated' ? (
                        <View className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800/60">
                          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                            {t('dashboard.mockDetection.successTitle')}
                          </Text>
                        </View>
                      ) : null}
                      {selectedDetectionTrusted ? (
                        <View className="rounded-full bg-emerald-100 px-3 py-1 dark:bg-emerald-500/20">
                          <Text className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-200">
                            {t('dashboard.recentAlerts.trustedBadge')}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View className="rounded-3xl border border-slate-200 bg-white/90 p-6 dark:border-slate-800 dark:bg-slate-900/70">
                      <Text className="text-sm text-slate-700 dark:text-slate-200">
                        “{selectedDetection.result.message.body}”
                      </Text>
                    </View>
                  </View>

                  <View className="mt-8">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t('dashboard.recentAlerts.matchesHeading', {
                        defaultValue: 'Detected signals',
                      })}
                    </Text>
                    <View className="mt-5 space-y-5">
                      {selectedDetection.result.matches.length ? (
                        selectedDetection.result.matches.map((match, index) => (
                          <View
                            key={`${match.label}-${index}`}
                            className="rounded-3xl border border-slate-200 bg-slate-50/80 px-5 py-5 dark:border-slate-700 dark:bg-slate-900/60">
                            <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {match.label}
                            </Text>
                            <Text className="mt-2 text-sm text-slate-600 dark:text-slate-200">
                              “{match.excerpt || match.label}”
                            </Text>
                          </View>
                        ))
                      ) : (
                        <View className="rounded-3xl border border-slate-200 bg-slate-50/80 px-5 py-5 dark:border-slate-700 dark:bg-slate-900/60">
                          <Text className="text-sm text-slate-600 dark:text-slate-200">
                            {t('dashboard.mockDetection.noMatches')}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View className="mt-8 rounded-3xl border border-slate-200 bg-slate-50/80 p-6 dark:border-slate-700 dark:bg-slate-900/60">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t('dashboard.recentAlerts.feedback.title')}
                    </Text>
                    <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t('dashboard.recentAlerts.feedback.subtitle')}
                    </Text>

                    <View className="mt-6 space-y-5">
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => handleFeedback('confirmed')}
                        disabled={
                          !feedbackReady || feedbackSubmitting || feedback?.status === 'confirmed'
                        }
                        activeOpacity={0.85}
                        className={`rounded-3xl border px-5 py-5 ${
                          !feedbackReady || feedbackSubmitting || feedback?.status === 'confirmed'
                            ? 'border-rose-500/30 bg-rose-500/10 opacity-60'
                            : 'border-rose-500/50 bg-rose-500/20'
                        }`}>
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1 pr-3">
                            <Text className="text-sm font-semibold text-rose-700 dark:text-rose-200">
                              {t('dashboard.recentAlerts.feedback.actions.confirm')}
                            </Text>
                            <Text className="mt-1 text-xs text-rose-600/80 dark:text-rose-200/80">
                              {t('dashboard.recentAlerts.feedback.actions.confirmHelper')}
                            </Text>
                          </View>
                          <MaterialCommunityIcons name="check-decagram" size={20} color="#fb7185" />
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => handleFeedback('false_positive')}
                        disabled={
                          !feedbackReady ||
                          feedbackSubmitting ||
                          feedback?.status === 'false_positive'
                        }
                        activeOpacity={0.85}
                        className={`rounded-3xl border px-5 py-5 ${
                          !feedbackReady ||
                          feedbackSubmitting ||
                          feedback?.status === 'false_positive'
                            ? 'border-emerald-500/30 bg-emerald-500/10 opacity-60'
                            : 'border-emerald-500/40 bg-emerald-500/15'
                        }`}>
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1 pr-3">
                            <Text className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
                              {t('dashboard.recentAlerts.feedback.actions.dismiss')}
                            </Text>
                            <Text className="mt-1 text-xs text-emerald-600/80 dark:text-emerald-200/80">
                              {t('dashboard.recentAlerts.feedback.actions.dismissHelper')}
                            </Text>
                          </View>
                          <MaterialCommunityIcons name="shield-check" size={20} color="#22c55e" />
                        </View>
                      </TouchableOpacity>
                    </View>

                    {feedbackSubmitting ? (
                      <View className="mt-3 flex-row items-center gap-2">
                        <ActivityIndicator size="small" color="#2563eb" />
                        <Text className="text-xs text-slate-500 dark:text-slate-400">
                          {t('dashboard.recentAlerts.feedback.status.pending')}
                        </Text>
                      </View>
                    ) : null}

                    {feedback ? (
                      <View className="mt-3 rounded-2xl border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/70">
                        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {feedback.status === 'confirmed'
                            ? t('dashboard.recentAlerts.feedback.status.confirmed')
                            : t('dashboard.recentAlerts.feedback.status.falsePositive')}
                        </Text>
                        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {t('dashboard.recentAlerts.feedback.status.submitted')}
                        </Text>
                      </View>
                    ) : null}

                    {feedbackError ? (
                      <Text className="mt-3 text-xs text-rose-500 dark:text-rose-400">
                        {feedbackError}
                      </Text>
                    ) : null}
                  </View>
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </AppModal>
    </SafeAreaView>
  );
}
