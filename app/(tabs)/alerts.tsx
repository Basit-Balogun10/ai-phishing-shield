import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { AppModal } from '../../components/AppModal';
import { type DetectionRecord, useDetectionHistory } from '../../lib/detection/detectionHistory';
import { type DetectionFeedbackStatus, useDetectionFeedback } from '../../lib/detection/feedback';
import { submitDetectionFeedback } from '../../lib/services/alertFeedback';
import { trackTelemetryEvent } from '../../lib/services/telemetry';
import { getTrustedSourceForSender } from '../../lib/trustedSources';

type AlertFilter = 'all' | 'historical' | 'simulated' | 'trusted';

const AlertFilterChip = ({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={onPress}
    className={`rounded-full px-3 py-1 ${
      isActive ? 'bg-blue-600/10 dark:bg-blue-500/20' : 'bg-slate-100 dark:bg-slate-800'
    }`}>
    <Text
      className={`text-xs font-semibold uppercase tracking-wide ${
        isActive ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-300'
      }`}>
      {label}
    </Text>
  </TouchableOpacity>
);

const getSeverityColor = (score: number) => {
  if (score >= 0.85) {
    return {
      badge: 'bg-rose-100 dark:bg-rose-500/20',
      text: 'text-rose-700 dark:text-rose-200',
      iconColor: '#dc2626',
    };
  }

  if (score >= 0.7) {
    return {
      badge: 'bg-amber-100 dark:bg-amber-500/20',
      text: 'text-amber-700 dark:text-amber-200',
      iconColor: '#d97706',
    };
  }

  return {
    badge: 'bg-blue-100 dark:bg-blue-500/20',
    text: 'text-blue-700 dark:text-blue-200',
    iconColor: '#2563eb',
  };
};

export default function AlertsScreen() {
  const { t } = useTranslation();
  const { merged: detectionHistory } = useDetectionHistory();
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [selectedDetection, setSelectedDetection] = useState<DetectionRecord | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [channel, setChannel] = useState<'all' | 'sms' | 'whatsapp' | 'email'>('all');
  const [trustedOnly, setTrustedOnly] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  const togglePosition = useSharedValue(0);

  useEffect(() => {
    togglePosition.value = withSpring(trustedOnly ? 1 : 0, {
      damping: 15,
      stiffness: 150,
    });
  }, [trustedOnly, togglePosition]);

  const animatedToggleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: togglePosition.value * 24 }],
  }));

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

  const filterOptions = useMemo(
    () => [
      { key: 'all' as const, label: t('dashboard.recentAlerts.filters.all') },
      { key: 'historical' as const, label: t('dashboard.recentAlerts.filters.historical') },
      { key: 'simulated' as const, label: t('dashboard.recentAlerts.filters.simulated') },
      { key: 'trusted' as const, label: t('dashboard.recentAlerts.filters.trusted') },
    ],
    [t]
  );

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

  const severityMatchers = useMemo(
    () => ({
      high: (score: number) => score >= 0.85,
      medium: (score: number) => score >= 0.7 && score < 0.85,
      low: (score: number) => score < 0.7,
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
    return detectionHistory.filter((record) => {
      if (filter !== 'all') {
        const isTrustedSource = Boolean(
          getTrustedSourceForSender(record.result.message.sender, record.result.message.channel)
        );

        if (filter === 'trusted') {
          if (!isTrustedSource) {
            return false;
          }
        } else if (record.source !== filter) {
          return false;
        }

        if (filter !== 'trusted' && trustedOnly && !isTrustedSource) {
          return false;
        }
      }

      if (filter === 'all' && trustedOnly) {
        const isTrusted = Boolean(
          getTrustedSourceForSender(record.result.message.sender, record.result.message.channel)
        );
        if (!isTrusted) {
          return false;
        }
      }

      if (channel !== 'all' && record.result.message.channel !== channel) {
        return false;
      }

      if (severity !== 'all') {
        const matcher = severityMatchers[severity];
        if (!matcher(record.result.score)) {
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
    channel,
    channelLabelMap,
    detectionHistory,
    filter,
    formatDetectedAt,
    normalizeText,
    query,
    severity,
    severityMatchers,
    trustedOnly,
  ]);

  const filtersTelemetryPayload = useMemo(
    () => ({
      source: filter,
      severity,
      channel,
      trustedOnly,
    }),
    [channel, filter, severity, trustedOnly]
  );

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
    });
  }, [filtersTelemetryPayload, query]);

  useEffect(() => {
    const previous = previousFiltersRef.current;
    const hasChanged =
      previous.source !== filtersTelemetryPayload.source ||
      previous.severity !== filtersTelemetryPayload.severity ||
      previous.channel !== filtersTelemetryPayload.channel ||
      previous.trustedOnly !== filtersTelemetryPayload.trustedOnly;

    previousFiltersRef.current = filtersTelemetryPayload;

    if (!hasChanged) {
      return;
    }

    trackTelemetryEvent('alerts.filter_changed', filtersTelemetryPayload);
  }, [filtersTelemetryPayload]);

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-6 pb-4 pt-6">
        <View className="flex-row items-center gap-4">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10 dark:bg-blue-500/20">
            <MaterialCommunityIcons name="shield-alert" size={28} color="#2563eb" />
          </View>
          <View className="flex-1">
            <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {t('dashboard.recentAlerts.title')}
            </Text>
          </View>
        </View>
        <Text className="mt-4 text-base text-slate-600 dark:text-slate-400">
          {t('dashboard.recentAlerts.subtitle')}
        </Text>
      </View>

      <View className="space-y-4 px-6 pb-4">
        <View className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <MaterialCommunityIcons name="magnify" size={20} color="#64748b" />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder={t('dashboard.recentAlerts.searchPlaceholder')}
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 text-sm text-slate-900 dark:text-slate-100"
          />
          {searchInput.length ? (
            <TouchableOpacity
              onPress={() => setSearchInput('')}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear')}
              className="rounded-full bg-slate-100 p-1.5 dark:bg-slate-800">
              <MaterialCommunityIcons name="close" size={16} color="#64748b" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <TouchableOpacity
            onPress={() => setIsFilterExpanded((prev) => !prev)}
            activeOpacity={0.85}
            className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('dashboard.recentAlerts.filtersTitle', { defaultValue: 'Filters' })}
              </Text>
              <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {[
                  filter !== 'all' ? filterOptions.find((opt) => opt.key === filter)?.label : null,
                  severity !== 'all'
                    ? severityOptions.find((opt) => opt.key === severity)?.label
                    : null,
                  channel !== 'all'
                    ? channelOptions.find((opt) => opt.key === channel)?.label
                    : null,
                  trustedOnly ? t('dashboard.recentAlerts.trustedOnlyBadge') : null,
                ]
                  .filter(Boolean)
                  .join(' • ') ||
                  t('dashboard.recentAlerts.noFiltersApplied', {
                    defaultValue: 'No filters applied',
                  })}
              </Text>
            </View>
            <MaterialCommunityIcons
              name={isFilterExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#64748b"
            />
          </TouchableOpacity>

          {isFilterExpanded ? (
            <View className="mt-4 space-y-4">
              <View>
                <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.recentAlerts.sourceLabel', { defaultValue: 'Source' })}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {filterOptions.map((option) => (
                    <AlertFilterChip
                      key={option.key}
                      label={option.label}
                      isActive={filter === option.key}
                      onPress={() => setFilter(option.key)}
                    />
                  ))}
                </View>
              </View>

              <View>
                <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.recentAlerts.severityLabel', { defaultValue: 'Severity' })}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {severityOptions.map((option) => (
                    <AlertFilterChip
                      key={option.key}
                      label={option.label}
                      isActive={severity === option.key}
                      onPress={() => setSeverity(option.key)}
                    />
                  ))}
                </View>
              </View>

              <View>
                <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.recentAlerts.channelLabel', { defaultValue: 'Channel' })}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {channelOptions.map((option) => (
                    <AlertFilterChip
                      key={option.key}
                      label={option.label}
                      isActive={channel === option.key}
                      onPress={() => setChannel(option.key)}
                    />
                  ))}
                </View>
              </View>

              <View className="border-t border-slate-200 pt-4 dark:border-slate-700">
                <TouchableOpacity
                  onPress={() => setTrustedOnly((prev) => !prev)}
                  activeOpacity={0.85}
                  className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t('dashboard.recentAlerts.trustedToggle.label')}
                    </Text>
                    <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {t('dashboard.recentAlerts.trustedToggle.description')}
                    </Text>
                  </View>
                  <View
                    className={`h-7 w-14 flex-row items-center rounded-full px-0.5 ${
                      trustedOnly ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}>
                    <Animated.View
                      className="h-6 w-6 rounded-full bg-white shadow-sm"
                      style={animatedToggleStyle}
                    />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 32 }}>
        {filteredDetections.length === 0 ? (
          <View className="items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
            <MaterialCommunityIcons name="check-circle" size={40} color="#22c55e" />
            <Text className="mt-4 text-center text-sm text-slate-500 dark:text-slate-300">
              {query || filter !== 'all' || severity !== 'all' || channel !== 'all' || trustedOnly
                ? t('dashboard.recentAlerts.emptyWithFilters', {
                    filters: [
                      query ? `“${searchInput.trim()}”` : null,
                      filter !== 'all'
                        ? filterOptions.find((item) => item.key === filter)?.label
                        : null,
                      severity !== 'all'
                        ? severityOptions.find((item) => item.key === severity)?.label
                        : null,
                      channel !== 'all'
                        ? channelOptions.find((item) => item.key === channel)?.label
                        : null,
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
            const { badge, text: severityText, iconColor } = getSeverityColor(entry.result.score);
            const primaryMatch = entry.result.matches[0];

            return (
              <TouchableOpacity
                key={entry.recordId}
                onPress={() => setSelectedDetection(entry)}
                activeOpacity={0.85}
                className="mb-4 flex-row gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-500/20">
                  <MaterialCommunityIcons name="alert" size={24} color={iconColor} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {entry.result.message.sender}
                    </Text>
                    <View className={`rounded-full px-3 py-1 ${badge}`}>
                      <Text
                        className={`text-xs font-semibold uppercase tracking-wide ${severityText}`}>
                        {t('dashboard.mockDetection.scoreLabel', {
                          score: Math.round(entry.result.score * 100),
                        })}
                      </Text>
                    </View>
                  </View>

                  <Text
                    className="mt-1 text-sm text-slate-500 dark:text-slate-300"
                    numberOfLines={2}>
                    {entry.result.message.body}
                  </Text>

                  <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-1">
                    <Text className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {formatDetectedAt(entry.detectedAt)}
                    </Text>
                    <Text className="text-xs font-medium uppercase tracking-wide text-blue-500 dark:text-blue-300">
                      {t(`dashboard.mockDetection.channels.${entry.result.message.channel}`)}
                    </Text>
                    {primaryMatch ? (
                      <Text
                        className="text-xs text-slate-500 dark:text-slate-400"
                        numberOfLines={1}>
                        {primaryMatch.label}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <AppModal
        isVisible={Boolean(selectedDetection)}
        onClose={() => setSelectedDetection(null)}
        testID="alerts-detection-detail-modal">
        <View className="flex-1 justify-end">
          <View className="w-full rounded-t-3xl bg-white p-6 dark:bg-slate-900">
            {selectedDetection ? (
              <View className="space-y-4">
                <View className="flex-row items-start justify-between">
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
                    activeOpacity={0.7}
                    className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      {t('common.back')}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View className="flex-row flex-wrap items-center gap-3">
                  <Text className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
                    {t(
                      `dashboard.mockDetection.channels.${selectedDetection.result.message.channel}`
                    )}
                  </Text>
                  <Text className="text-sm text-slate-500 dark:text-slate-300">
                    {t('dashboard.mockDetection.scoreLabel', {
                      score: Math.round(selectedDetection.result.score * 100),
                    })}
                  </Text>
                  {selectedDetection.source === 'simulated' ? (
                    <Text className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      • {t('dashboard.mockDetection.successTitle')}
                    </Text>
                  ) : null}
                </View>

                <Text className="text-sm text-slate-700 dark:text-slate-200">
                  “{selectedDetection.result.message.body}”
                </Text>

                <View className="space-y-2">
                  {selectedDetection.result.matches.length ? (
                    selectedDetection.result.matches.map((match, index) => (
                      <View
                        key={`${match.label}-${index}`}
                        className="flex-row items-start gap-3 rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/80">
                        <MaterialCommunityIcons name="shield-alert" size={18} color="#fb923c" />
                        <View className="flex-1">
                          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {match.label}
                          </Text>
                          <Text className="mt-1 text-sm text-slate-600 dark:text-slate-200">
                            “{match.excerpt || match.label}”
                          </Text>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/80">
                      <Text className="text-sm text-slate-600 dark:text-slate-200">
                        {t('dashboard.mockDetection.noMatches')}
                      </Text>
                    </View>
                  )}
                </View>

                <View className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                  <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t('dashboard.recentAlerts.feedback.title')}
                  </Text>
                  <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t('dashboard.recentAlerts.feedback.subtitle')}
                  </Text>

                  <View className="mt-4 space-y-3">
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => handleFeedback('confirmed')}
                      disabled={
                        !feedbackReady || feedbackSubmitting || feedback?.status === 'confirmed'
                      }
                      activeOpacity={0.85}
                      className={`rounded-2xl border px-4 py-3 ${
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
                      className={`rounded-2xl border px-4 py-3 ${
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
                    <View className="mt-3 rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/80">
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
              </View>
            ) : null}
          </View>
        </View>
      </AppModal>
    </SafeAreaView>
  );
}
