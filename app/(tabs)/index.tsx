import { Link, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, Platform, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOnboardingGate } from '../../lib/hooks/useOnboardingGate';
import { useModelManager } from '../../lib/modelManager';
import { triggerMockDetectionNow } from '../../lib/services/backgroundDetection';
import { trackTelemetryEvent } from '../../lib/services/telemetry';
import type { DetectionResult } from '../../lib/detection/mockDetection';
import { analyzeMessage, getMockMessages } from '../../lib/detection/mockDetection';
import {
  addSimulatedDetection,
  removeSimulatedDetection,
  useDetectionHistory,
  type DetectionRecord,
} from '../../lib/detection/detectionHistory';
import { useTrustedSources, type TrustedSource } from '../../lib/trustedSources';
import { AppModal } from '../../components/AppModal';
import { ReportMessageModal } from '../../components/ReportMessageModal';
import { clearOnboardingComplete } from '../../lib/storage';
import { useTelemetryPreferences } from '../../lib/telemetryPreferences';
import { shieldStateStore, useShieldState } from '../../lib/shieldState';
import { useStatsSummary, type StatsTimeframe } from '../../lib/detection/stats';
import { formatDetectionTimestamp } from '../../lib/detection/formatters';

const SECTION_WRAPPER =
  'rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900';
const SECTION_TITLE =
  'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

const MOCK_TOOLS_DISMISS_KEY = 'dashboard_mock_tools_dismissed_v1';

const STATS_TIMEFRAME_OPTIONS: StatsTimeframe[] = ['24h', '7d', '30d', 'all'];

const SEVERITY_THRESHOLDS = {
  high: 0.85,
  medium: 0.7,
} as const;

const SEVERITY_STYLES: Record<
  'high' | 'medium' | 'low',
  { badge: string; text: string; subtle: string }
> = {
  high: {
    badge: 'bg-rose-100 dark:bg-rose-500/20',
    text: 'text-rose-700 dark:text-rose-100',
    subtle: 'text-rose-500 dark:text-rose-200',
  },
  medium: {
    badge: 'bg-amber-100 dark:bg-amber-500/20',
    text: 'text-amber-700 dark:text-amber-100',
    subtle: 'text-amber-500 dark:text-amber-200',
  },
  low: {
    badge: 'bg-emerald-100 dark:bg-emerald-500/20',
    text: 'text-emerald-700 dark:text-emerald-100',
    subtle: 'text-emerald-500 dark:text-emerald-200',
  },
};

const resolveMockToolsEnabled = () => {
  const envFlag = process.env.EXPO_PUBLIC_ENABLE_MOCK_TOOLS;
  if (typeof envFlag === 'string') {
    return envFlag.toLowerCase() === 'true';
  }

  const configFlag = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.[
    'enableMockTools'
  ];
  return configFlag === true;
};

export default function DashboardScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { allowed, permissionsSatisfied } = useOnboardingGate();
  const { merged: detectionHistory, lastSimulated } = useDetectionHistory();
  const {
    ready: modelReady,
    current: activeModel,
    status: modelStatus,
    activeOperation: modelOperation,
  } = useModelManager();
  const { ready: telemetryReady, preferences: telemetryPreferences } = useTelemetryPreferences();
  const { sources: trustedSources } = useTrustedSources();
  const { ready: shieldReady, paused: shieldPaused } = useShieldState();
  const [isTriggeringDetection, setIsTriggeringDetection] = useState(false);
  const [isUpdatingShield, setIsUpdatingShield] = useState(false);
  const [selectedDetection, setSelectedDetection] = useState<DetectionRecord | null>(null);
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const mockToolsEnabled = resolveMockToolsEnabled();
  const [showMockTools, setShowMockTools] = useState(false);
  const [statsTimeframe, setStatsTimeframe] = useState<StatsTimeframe>('7d');
  const trustedLookup = useMemo(() => {
    const map = new Map<string, TrustedSource>();
    const normalize = (value: string) => value.trim().toLowerCase();

    trustedSources.forEach((source) => {
      map.set(`${source.channel}:${normalize(source.handle)}`, source);
    });

    return map;
  }, [trustedSources]);

  const getTrustedSource = useCallback(
    (sender: string, channel: DetectionRecord['result']['message']['channel']) => {
      const key = `${channel}:${sender.trim().toLowerCase()}`;
      return trustedLookup.get(key);
    },
    [trustedLookup]
  );
  const lastSimulatedTrustedSource = useMemo(() => {
    if (!lastSimulated) {
      return null;
    }

    return getTrustedSource(
      lastSimulated.result.message.sender,
      lastSimulated.result.message.channel
    );
  }, [getTrustedSource, lastSimulated]);

  const selectedDetectionTrustedSource = useMemo(() => {
    if (!selectedDetection) {
      return null;
    }

    return getTrustedSource(
      selectedDetection.result.message.sender,
      selectedDetection.result.message.channel
    );
  }, [getTrustedSource, selectedDetection]);
  const [safePreview, setSafePreview] = useState<DetectionResult | null>(null);
  const statsSummary = useStatsSummary(statsTimeframe);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const activeModelVersion = activeModel?.version ?? 'v0.1.0';
  const protectionActive = permissionsSatisfied && !shieldPaused;
  const heroStatusLabel = protectionActive
    ? t('dashboard.hero.status.active')
    : t('dashboard.hero.status.paused');
  const heroDescription = protectionActive
    ? t('dashboard.hero.activeDescription')
    : t('dashboard.hero.pausedDescription');
  const modelStatusLabel = useMemo(() => {
    if (!modelReady) {
      return null;
    }

    if (modelStatus === 'syncing') {
      return t('dashboard.hero.modelStatus.syncing');
    }

    if (modelStatus === 'downloading' && modelOperation?.version) {
      return t('dashboard.hero.modelStatus.downloading', { version: modelOperation.version });
    }

    if (modelOperation?.type === 'activate' && modelOperation.version) {
      return t('dashboard.hero.modelStatus.activating', { version: modelOperation.version });
    }

    if (modelOperation?.type === 'remove' && modelOperation.version) {
      return t('dashboard.hero.modelStatus.removing', { version: modelOperation.version });
    }

    return null;
  }, [modelOperation, modelReady, modelStatus, t]);
  useEffect(() => {
    if (!mockToolsEnabled) {
      setShowMockTools(false);
      return;
    }

    AsyncStorage.getItem(MOCK_TOOLS_DISMISS_KEY)
      .then((value) => {
        setShowMockTools(value !== 'true');
      })
      .catch((error) => {
        console.warn('[dashboard] Failed to load mock tools dismissal state', error);
        setShowMockTools(true);
      });
  }, [mockToolsEnabled]);

  const mockMessages = useMemo(() => getMockMessages(), []);
  const messageAnalyses = useMemo(
    () => mockMessages.map((message) => analyzeMessage(message)),
    [mockMessages]
  );

  const handleDismissMockTools = useCallback(() => {
    setShowMockTools(false);
    AsyncStorage.setItem(MOCK_TOOLS_DISMISS_KEY, 'true').catch((error) => {
      console.warn('[dashboard] Failed to persist mock tools dismissal', error);
    });
  }, []);

  const handleRestoreMockTools = useCallback(() => {
    setShowMockTools(true);
    AsyncStorage.removeItem(MOCK_TOOLS_DISMISS_KEY).catch((error) => {
      console.warn('[dashboard] Failed to restore mock tools dismissal state', error);
    });
  }, []);

  const handleHistoryPress = useCallback(() => {
    trackTelemetryEvent('dashboard.quick_action.alerts_opened');
    router.push('/alerts');
  }, [router]);

  const handleOpenStats = useCallback(() => {
    trackTelemetryEvent('dashboard.quick_action.stats_opened');
    router.push('/stats');
  }, [router]);

  const handleOpenDiagnostics = useCallback(() => {
    trackTelemetryEvent('dashboard.hero.diagnostics_opened');
    router.push('/settings/diagnostics');
  }, [router]);

  const handleManageTrustedSources = useCallback(() => {
    trackTelemetryEvent('dashboard.quick_action.trusted_sources_opened');
    router.push('/settings');
  }, [router]);

  const handleOpenSettings = useCallback(() => {
    trackTelemetryEvent('dashboard.quick_action.settings_opened');
    router.push('/settings');
  }, [router]);

  const handleOpenModelManager = useCallback(() => {
    trackTelemetryEvent('settings.model.manage_opened', { source: 'dashboard_quick_action' });
    router.push('/settings/model');
  }, [router]);

  const handleReportPress = useCallback(() => {
    if (!telemetryReady) {
      Alert.alert(t('dashboard.report.loadingTitle'), t('dashboard.report.loadingBody'));
      return;
    }

    if (!telemetryPreferences.allowManualReports) {
      Alert.alert(t('dashboard.report.disabled.title'), t('dashboard.report.disabled.body'));
      return;
    }

    setIsReportModalVisible(true);
    trackTelemetryEvent('dashboard.manual_report_opened', {
      source: 'quick_action',
    });
  }, [t, telemetryPreferences.allowManualReports, telemetryReady]);

  const handleStatsTimeframeChange = useCallback(
    (next: StatsTimeframe) => {
      if (next === statsTimeframe) {
        return;
      }

      setStatsTimeframe(next);
      trackTelemetryEvent('stats.timeframe_changed', {
        timeframe: next,
      });
    },
    [statsTimeframe]
  );

  const handleToggleShield = useCallback(async () => {
    if (isUpdatingShield || !shieldReady) {
      return;
    }

    const nextPaused = !shieldPaused;

    try {
      setIsUpdatingShield(true);
      await shieldStateStore.setPaused(nextPaused);
      trackTelemetryEvent('dashboard.shield_toggled', {
        paused: nextPaused,
      });
    } catch (error) {
      console.warn('[dashboard] Failed to toggle shield', error);
      Alert.alert(t('dashboard.report.status.errorTitle'), t('dashboard.report.status.error'));
    } finally {
      setIsUpdatingShield(false);
    }
  }, [isUpdatingShield, shieldPaused, shieldReady, t]);

  const quickActions = useMemo(
    () => [
      {
        key: 'alerts' as const,
        icon: 'bell-alert-outline',
        title: t('dashboard.quickActions.alerts.title'),
        subtitle: t('dashboard.quickActions.alerts.subtitle'),
        action: handleHistoryPress,
      },
      {
        key: 'stats' as const,
        icon: 'chart-timeline-variant',
        title: t('dashboard.quickActions.stats.title'),
        subtitle: t('dashboard.quickActions.stats.subtitle'),
        action: handleOpenStats,
      },
      {
        key: 'trusted' as const,
        icon: 'shield-account',
        title: t('dashboard.quickActions.trusted.title'),
        subtitle: t('dashboard.quickActions.trusted.subtitle'),
        action: handleManageTrustedSources,
      },
      {
        key: 'settings' as const,
        icon: 'cog-outline',
        title: t('dashboard.quickActions.settings.title'),
        subtitle: t('dashboard.quickActions.settings.subtitle'),
        action: handleOpenSettings,
      },
      {
        key: 'model' as const,
        icon: 'database-sync',
        title: t('dashboard.quickActions.model.title'),
        subtitle: t('dashboard.quickActions.model.subtitle'),
        action: handleOpenModelManager,
      },
    ],
    [
      handleHistoryPress,
      handleManageTrustedSources,
      handleOpenSettings,
      handleOpenModelManager,
      handleOpenStats,
      t,
    ]
  );

  const formatDetectedAt = useCallback(
    (value: string) => formatDetectionTimestamp(value, i18n.language),
    [i18n.language]
  );

  const detectionEntries = useMemo(() => detectionHistory, [detectionHistory]);
  const latestDetection = detectionEntries[0] ?? null;
  const lastDetectionDisplay = latestDetection
    ? t('dashboard.hero.lastScan', { time: formatDetectedAt(latestDetection.detectedAt) })
    : t('dashboard.hero.lastScanFallback');
  const trustedCountLabel = t('dashboard.hero.trustedCount', {
    count: trustedSources.length,
  });
  const statsTimeframeLabel = t(`dashboard.stats.timeframes.${statsTimeframe}`);
  const statsTrendLabel = useMemo(() => {
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
  const statsCards = useMemo(
    () => [
      {
        key: 'scanned',
        label: t('dashboard.stats.messagesScanned'),
        value: numberFormatter.format(statsSummary.totals.scanned),
        icon: 'chart-line',
      },
      {
        key: 'threats',
        label: t('dashboard.stats.threatsBlocked'),
        value: numberFormatter.format(statsSummary.totals.threats),
        icon: 'shield-alert',
      },
      {
        key: 'safe',
        label: t('dashboard.stats.safeMessages'),
        value: numberFormatter.format(statsSummary.totals.safe),
        icon: 'shield-check-outline',
      },
    ],
    [
      numberFormatter,
      statsSummary.totals.safe,
      statsSummary.totals.scanned,
      statsSummary.totals.threats,
      t,
    ]
  );
  const recentAlerts = useMemo(() => detectionEntries.slice(0, 4), [detectionEntries]);
  const trustedPreview = useMemo(() => trustedSources.slice(0, 3), [trustedSources]);
  const remainingTrusted = Math.max(trustedSources.length - trustedPreview.length, 0);
  const trustedSummaryLabel = t('dashboard.trustedSources.count', {
    count: trustedSources.length,
  });

  const safeSamples = useMemo(
    () => messageAnalyses.filter((analysis) => analysis.score < 0.6),
    [messageAnalyses]
  );

  // const lastScanText = useMemo(() => {
  //   if (!detectionEntries.length) {
  //     return t('dashboard.hero.lastScanFallback');
  //   }

  //   return formatDetectedAt(detectionEntries[0].detectedAt);
  // }, [detectionEntries, formatDetectedAt, t]);

  const handleSimulateDetectionPress = useCallback(async () => {
    try {
      setIsTriggeringDetection(true);
      const outcome = await triggerMockDetectionNow();
      trackTelemetryEvent('dashboard.mock_detection_triggered', {
        source: 'quick_action',
        triggered: outcome.triggered,
      });

      if (outcome.triggered) {
        const detection: DetectionRecord = {
          recordId: `${outcome.result.message.id}:${Date.now()}`,
          result: outcome.result,
          detectedAt: new Date().toISOString(),
          source: 'simulated',
        };

        addSimulatedDetection(detection);
        setSelectedDetection(detection);
        Alert.alert(
          t('dashboard.mockDetection.successTitle'),
          t('dashboard.mockDetection.successBody')
        );
      } else {
        Alert.alert(
          t('dashboard.mockDetection.noThreatTitle'),
          t('dashboard.mockDetection.noThreatBody')
        );
      }
    } catch (error) {
      console.warn('[dashboard] Failed to trigger mock detection', error);
      Alert.alert(t('dashboard.mockDetection.errorTitle'), t('dashboard.mockDetection.errorBody'));
    } finally {
      setIsTriggeringDetection(false);
    }
  }, [t]);

  const handlePreviewSafeSample = useCallback(() => {
    if (!safeSamples.length) {
      Alert.alert(
        t('dashboard.mockDetection.safeSampleUnavailableTitle'),
        t('dashboard.mockDetection.safeSampleUnavailableBody')
      );
      return;
    }

    setSafePreview(safeSamples[Math.floor(Math.random() * safeSamples.length)]);
    trackTelemetryEvent('dashboard.safe_sample_previewed', undefined);
  }, [safeSamples, t]);

  const handleClearLastDetection = useCallback(() => {
    if (!lastSimulated) {
      return;
    }

    removeSimulatedDetection(lastSimulated.recordId);
    setSelectedDetection(null);
    Alert.alert(
      t('dashboard.mockDetection.clearedTitle'),
      t('dashboard.mockDetection.clearedBody')
    );
    trackTelemetryEvent('dashboard.detection_cleared', {
      recordId: lastSimulated.recordId,
    });
  }, [lastSimulated, t]);

  const handleResetOnboarding = useCallback(async () => {
    try {
      await clearOnboardingComplete();
      Alert.alert(
        t('developerTools.resetOnboarding.successTitle'),
        t('developerTools.resetOnboarding.successBody')
      );
    } catch (error) {
      console.warn('[dashboard] Failed to reset onboarding', error);
      Alert.alert(
        t('developerTools.resetOnboarding.errorTitle'),
        t('developerTools.resetOnboarding.errorBody')
      );
    }
  }, [t]);

  const handleSelectDetection = useCallback((record: DetectionRecord) => {
    setSelectedDetection(record);
    trackTelemetryEvent('dashboard.recent_alert_opened', {
      recordId: record.recordId,
      source: record.source,
    });
  }, []);

  const getSeverityKey = useCallback((score: number): 'high' | 'medium' | 'low' => {
    if (score >= SEVERITY_THRESHOLDS.high) {
      return 'high';
    }

    if (score >= SEVERITY_THRESHOLDS.medium) {
      return 'medium';
    }

    return 'low';
  }, []);

  // if (checking) {
  //   return (
  //     <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
  //       <ActivityIndicator size="large" color="#2563eb" />
  //       <Text className="mt-4 text-sm text-slate-500 dark:text-slate-400">
  //         {t('common.loading')}
  //       </Text>
  //     </SafeAreaView>
  //   );
  // }

  if (!allowed || !permissionsSatisfied) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View className="gap-4">
            <View className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {t('dashboard.permissionsReminder.title')}
              </Text>
              <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {t('dashboard.permissionsReminder.body')}
              </Text>
              <View className="mt-4 flex-row gap-3">
                <Link href="/settings" asChild>
                  <TouchableOpacity className="flex-1 rounded-full bg-blue-600 px-5 py-3">
                    <Text className="text-center text-sm font-semibold text-white">
                      {t('dashboard.permissionsReminder.cta')}
                    </Text>
                  </TouchableOpacity>
                </Link>
                <Link href="/onboarding" asChild>
                  <TouchableOpacity className="flex-1 rounded-full border border-blue-600 px-5 py-3">
                    <Text className="text-center text-sm font-semibold text-blue-600">
                      {t('dashboard.permissionsReminder.reviewOnboarding')}
                    </Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 24 }}>
        <View className="gap-6">
          <View className="space-y-3">
            <Text className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
              {t('dashboard.title')}
            </Text>
            <Text className="text-base text-slate-600 dark:text-slate-400">
              {t('dashboard.subtitle')}
            </Text>
          </View>

          <View className="rounded-3xl bg-blue-600 p-6 shadow-lg dark:shadow-blue-900/40">
            <View className="flex-row items-start justify-between gap-4">
              <View className="flex-1 space-y-4">
                <View className="flex-row flex-wrap items-center gap-2">
                  <View className="rounded-full bg-white/15 px-3 py-1">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-blue-100">
                      {heroStatusLabel}
                    </Text>
                  </View>
                  <View className="rounded-full bg-white/15 px-3 py-1">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-blue-100">
                      {t('dashboard.hero.modelVersion', { version: activeModelVersion })}
                    </Text>
                  </View>
                  {modelStatusLabel && permissionsSatisfied ? (
                    <View className="rounded-full bg-white/15 px-3 py-1">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-blue-100">
                        {modelStatusLabel}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    className={`rounded-full px-3 py-1 ${
                      permissionsSatisfied ? 'bg-emerald-500/25' : 'bg-amber-500/40'
                    }`}>
                    <Text className="text-xs font-semibold uppercase tracking-wide text-blue-100">
                      {permissionsSatisfied
                        ? t('dashboard.hero.permissions.ok')
                        : t('dashboard.hero.permissions.missing')}
                    </Text>
                  </View>
                </View>

                <Text className="text-lg font-semibold text-blue-50">{heroDescription}</Text>

                <View className="flex-row flex-wrap gap-3">
                  <View className="flex-row items-center gap-2 rounded-2xl bg-white/10 px-3 py-2">
                    <MaterialCommunityIcons name="clock-outline" size={18} color="#bfdbfe" />
                    <Text className="text-sm text-blue-50/90">{lastDetectionDisplay}</Text>
                  </View>
                  <View className="flex-row items-center gap-2 rounded-2xl bg-white/10 px-3 py-2">
                    <MaterialCommunityIcons name="shield-account" size={18} color="#bfdbfe" />
                    <Text className="text-sm text-blue-50/90">{trustedCountLabel}</Text>
                  </View>
                </View>
              </View>
              <View className="items-end gap-4">
                <View className="flex-row items-center gap-2 rounded-full bg-white/10 px-3 py-2">
                  <Switch
                    value={!shieldPaused}
                    onValueChange={handleToggleShield}
                    disabled={!shieldReady || isUpdatingShield}
                    trackColor={{ false: '#94a3b8', true: '#22c55e' }}
                    thumbColor={
                      Platform.OS === 'ios' ? undefined : shieldPaused ? '#f4f4f5' : '#ffffff'
                    }
                  />
                  <Text className="text-xs font-semibold uppercase tracking-wide text-blue-100">
                    {shieldPaused
                      ? t('dashboard.hero.status.paused')
                      : t('dashboard.hero.status.active')}
                  </Text>
                </View>
                <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-white/10">
                  <MaterialCommunityIcons
                    name={shieldPaused ? 'shield-off-outline' : 'shield-check'}
                    size={40}
                    color="white"
                  />
                </View>
              </View>
            </View>

            <View className="mt-6 flex-row flex-wrap gap-3">
              <TouchableOpacity
                onPress={handleOpenDiagnostics}
                activeOpacity={0.85}
                className="flex-row items-center gap-2 rounded-full bg-white/15 px-4 py-2">
                <MaterialCommunityIcons name="tune" size={18} color="#bfdbfe" />
                <Text className="text-sm font-semibold text-blue-50">
                  {t('dashboard.hero.goToDiagnostics')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOpenStats}
                activeOpacity={0.85}
                className="flex-row items-center gap-2 rounded-full border border-white/30 px-4 py-2">
                <MaterialCommunityIcons name="chart-timeline-variant" size={18} color="#dbeafe" />
                <Text className="text-sm font-semibold text-blue-50">
                  {t('dashboard.hero.viewStats')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className={SECTION_WRAPPER}>
            <View className="flex-row items-center justify-between gap-3">
              <Text className={SECTION_TITLE}>{t('dashboard.stats.title')}</Text>
              <TouchableOpacity
                onPress={handleOpenStats}
                activeOpacity={0.85}
                className="flex-row items-center gap-2 rounded-full border border-slate-200 px-4 py-2 dark:border-slate-700">
                <MaterialCommunityIcons name="chart-timeline-variant" size={18} color="#2563eb" />
                <Text className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                  {t('dashboard.hero.viewStats')}
                </Text>
              </TouchableOpacity>
            </View>
            <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t('dashboard.stats.since', { timeframe: statsTimeframeLabel })}
            </Text>
            <View className="mt-4 flex-row flex-wrap gap-2">
              {STATS_TIMEFRAME_OPTIONS.map((option) => {
                const selected = option === statsTimeframe;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => handleStatsTimeframeChange(option)}
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
            <View className="mt-4 flex-row flex-wrap gap-3">
              {statsCards.map((card) => (
                <View
                  key={card.key}
                  className="min-w-[30%] flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <View className="mb-3 h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/20">
                    <MaterialCommunityIcons name={card.icon as any} size={20} color="#2563eb" />
                  </View>
                  <Text className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    {card.value}
                  </Text>
                  <Text className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {card.label}
                  </Text>
                </View>
              ))}
            </View>
            <Text className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              {statsTrendLabel}
            </Text>
          </View>

          <View className={SECTION_WRAPPER}>
            <Text className={SECTION_TITLE}>{t('dashboard.quickActions.title')}</Text>
            <View className="mt-4 flex-row flex-wrap gap-3">
              {quickActions.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  onPress={action.action}
                  activeOpacity={0.85}
                  className="min-w-[48%] flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                  <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/20">
                    <MaterialCommunityIcons name={action.icon as any} size={22} color="#2563eb" />
                  </View>
                  <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {action.title}
                  </Text>
                  <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    {action.subtitle}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View className={SECTION_WRAPPER}>
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className={SECTION_TITLE}>{t('dashboard.recentAlerts.title')}</Text>
                <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {t('dashboard.recentAlerts.subtitle')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleHistoryPress}
                activeOpacity={0.85}
                className="flex-row items-center gap-2 rounded-full border border-slate-200 px-4 py-2 dark:border-slate-700">
                <MaterialCommunityIcons name="arrow-right" size={18} color="#2563eb" />
                <Text className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                  {t('dashboard.recentAlerts.viewAll')}
                </Text>
              </TouchableOpacity>
            </View>
            {recentAlerts.length ? (
              <View className="mt-4 space-y-3">
                {recentAlerts.map((record) => {
                  const severityKey = getSeverityKey(record.result.score);
                  const severityStyle = SEVERITY_STYLES[severityKey];
                  const trustedSource = getTrustedSource(
                    record.result.message.sender,
                    record.result.message.channel
                  );
                  return (
                    <TouchableOpacity
                      key={record.recordId}
                      onPress={() => handleSelectDetection(record)}
                      activeOpacity={0.85}
                      className="space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="flex-1 pr-4">
                          <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {record.result.message.sender}
                          </Text>
                          <Text
                            className="mt-2 text-sm text-slate-600 dark:text-slate-300"
                            numberOfLines={2}>
                            “{record.result.message.body}”
                          </Text>
                        </View>
                        <View className="items-end gap-2">
                          <Text className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDetectedAt(record.detectedAt)}
                          </Text>
                          <View className="flex-row flex-wrap justify-end gap-2">
                            <View className={`rounded-full px-3 py-1 ${severityStyle.badge}`}>
                              <Text
                                className={`text-[10px] font-semibold uppercase tracking-wide ${severityStyle.text}`}>
                                {t(`dashboard.recentAlerts.severity.${severityKey}`)}
                              </Text>
                            </View>
                            <View className="rounded-full bg-blue-100 px-3 py-1 dark:bg-blue-500/20">
                              <Text className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-200">
                                {t(
                                  `dashboard.mockDetection.channels.${record.result.message.channel}`
                                )}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text
                          className={`text-xs font-medium uppercase tracking-wide ${severityStyle.subtle}`}>
                          {t('dashboard.mockDetection.scoreLabel', {
                            score: Math.round(record.result.score * 100),
                          })}
                        </Text>
                        {record.source === 'simulated' ? (
                          <View className="flex-row items-center gap-1 rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">
                            <MaterialCommunityIcons
                              name="flask-outline"
                              size={12}
                              color="#475569"
                            />
                            <Text className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                              {t('dashboard.recentAlerts.filters.simulated')}
                            </Text>
                          </View>
                        ) : null}
                        {trustedSource ? (
                          <View className="flex-row items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 dark:bg-emerald-500/20">
                            <MaterialCommunityIcons name="shield-check" size={12} color="#059669" />
                            <Text className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-200">
                              {t('dashboard.recentAlerts.trustedBadge')}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                {t('dashboard.recentAlerts.empty')}
              </Text>
            )}
          </View>

          <View className={SECTION_WRAPPER}>
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className={SECTION_TITLE}>{t('dashboard.trustedSources.title')}</Text>
                <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {t('dashboard.trustedSources.subtitle')}
                </Text>
                <Text className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {trustedSummaryLabel}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleManageTrustedSources}
                activeOpacity={0.85}
                className="flex-row items-center gap-2 rounded-full border border-slate-200 px-4 py-2 dark:border-slate-700">
                <MaterialCommunityIcons name="account-cog" size={18} color="#2563eb" />
                <Text className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                  {t('dashboard.trustedSources.cta')}
                </Text>
              </TouchableOpacity>
            </View>
            {trustedPreview.length ? (
              <View className="mt-4 space-y-3">
                {trustedPreview.map((source) => (
                  <View
                    key={source.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 pr-4">
                        <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {source.displayName || source.handle}
                        </Text>
                        <Text className="text-xs text-slate-500 dark:text-slate-400">
                          {source.handle}
                        </Text>
                      </View>
                      <View className="rounded-full bg-blue-100 px-3 py-1 dark:bg-blue-500/20">
                        <Text className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-200">
                          {t(`dashboard.mockDetection.channels.${source.channel}`)}
                        </Text>
                      </View>
                    </View>
                    {source.note ? (
                      <Text className="mt-2 text-xs text-slate-500 dark:text-slate-300">
                        {source.note}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                {t('dashboard.trustedSources.empty')}
              </Text>
            )}
            {remainingTrusted > 0 ? (
              <Text className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                {t('dashboard.trustedSources.more', { remaining: remainingTrusted })}
              </Text>
            ) : null}
          </View>

          <View className="space-y-3 rounded-3xl border border-blue-100 bg-blue-50 p-6 dark:border-blue-900/60 dark:bg-blue-500/10">
            <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('dashboard.report.title')}
            </Text>
            <Text className="text-sm text-slate-600 dark:text-slate-300">
              {t('dashboard.report.subtitle')}
            </Text>
            <TouchableOpacity
              onPress={handleReportPress}
              activeOpacity={0.85}
              className="mt-2 flex-row items-center justify-center rounded-full bg-blue-600 px-5 py-3 dark:bg-blue-500">
              <Text className="text-base font-semibold text-white">
                {t('dashboard.report.cta')}
              </Text>
            </TouchableOpacity>
          </View>

          {mockToolsEnabled ? (
            showMockTools ? (
              <View className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {t('dashboard.mockDetection.title')}
                    </Text>
                    <Text className="text-sm text-slate-600 dark:text-slate-300">
                      {t('dashboard.mockDetection.subtitle')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleDismissMockTools}
                    accessibilityLabel={t('common.clear')}
                    activeOpacity={0.7}
                    className="rounded-full bg-slate-100 p-2 dark:bg-slate-800">
                    <MaterialCommunityIcons name="close" size={18} color="#475569" />
                  </TouchableOpacity>
                </View>

                <View className="flex-row flex-wrap gap-3">
                  <TouchableOpacity
                    disabled={isTriggeringDetection}
                    onPress={handleSimulateDetectionPress}
                    activeOpacity={0.85}
                    className={`flex-1 flex-row items-center justify-center rounded-full px-5 py-3 ${
                      isTriggeringDetection
                        ? 'bg-slate-400/60 dark:bg-slate-700'
                        : 'bg-slate-900 dark:bg-blue-500'
                    }`}>
                    <MaterialCommunityIcons name="beaker-check" size={18} color="white" />
                    <Text className="ml-2 text-base font-semibold text-white">
                      {isTriggeringDetection
                        ? t('dashboard.mockDetection.runningLabel')
                        : t('dashboard.mockDetection.cta')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handlePreviewSafeSample}
                    activeOpacity={0.85}
                    className="flex-1 flex-row items-center justify-center rounded-full bg-slate-100 px-5 py-3 dark:bg-slate-800">
                    <MaterialCommunityIcons name="shield-check-outline" size={18} color="#2563eb" />
                    <Text className="ml-2 text-base font-semibold text-blue-700 dark:text-blue-300">
                      {t('dashboard.mockDetection.viewSafeSample')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleClearLastDetection}
                    activeOpacity={0.85}
                    disabled={!lastSimulated}
                    className={`flex-1 flex-row items-center justify-center rounded-full border px-5 py-3 ${
                      lastSimulated
                        ? 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
                        : 'border-slate-200 bg-slate-100 opacity-60 dark:border-slate-800 dark:bg-slate-800'
                    }`}>
                    <MaterialCommunityIcons
                      name="backup-restore"
                      size={18}
                      color={lastSimulated ? '#475569' : '#94a3b8'}
                    />
                    <Text
                      className={`ml-2 text-base font-semibold ${
                        lastSimulated
                          ? 'text-slate-700 dark:text-slate-200'
                          : 'text-slate-400 dark:text-slate-600'
                      }`}>
                      {t('dashboard.mockDetection.clearLastDetection')}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text className="text-xs text-slate-400 dark:text-slate-500">
                  {t('dashboard.mockDetection.helper')}
                </Text>
                {lastSimulated ? (
                  <TouchableOpacity
                    onPress={() => setSelectedDetection(lastSimulated)}
                    activeOpacity={0.85}
                    className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-100/60 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-4">
                        <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {lastSimulated.result.message.sender}
                        </Text>
                        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                          {t('dashboard.mockDetection.detectedAt', {
                            time: new Date(lastSimulated.detectedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                          })}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                          {t(
                            `dashboard.mockDetection.channels.${lastSimulated.result.message.channel}`
                          )}
                        </Text>
                        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                          {t('dashboard.mockDetection.scoreLabel', {
                            score: Math.round(lastSimulated.result.score * 100),
                          })}
                        </Text>
                      </View>
                    </View>

                    <Text
                      className="text-sm italic text-slate-600 dark:text-slate-200"
                      numberOfLines={3}>
                      “{lastSimulated.result.message.body}”
                    </Text>

                    {lastSimulatedTrustedSource ? (
                      <View className="flex-row flex-wrap items-center gap-2">
                        <View className="flex-row items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 dark:bg-emerald-500/20">
                          <MaterialCommunityIcons name="shield-check" size={14} color="#059669" />
                          <Text className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                            {t('dashboard.recentAlerts.trustedBadge')}
                          </Text>
                        </View>
                        <Text className="text-xs text-emerald-700 dark:text-emerald-300">
                          {lastSimulatedTrustedSource.note ??
                            t('dashboard.recentAlerts.trustedDefault')}
                        </Text>
                      </View>
                    ) : null}

                    <Text className="text-xs text-blue-600 dark:text-blue-300">
                      {t('dashboard.mockDetection.successTitle')}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text className="text-xs text-slate-500 dark:text-slate-400">
                    {t('dashboard.mockDetection.noResultPlaceholder')}
                  </Text>
                )}

                <View className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('dashboard.quickActions.developer.title')}
                  </Text>
                  <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {t('dashboard.quickActions.developer.subtitle')}
                  </Text>
                  <View className="mt-3 flex-row flex-wrap gap-3">
                    <TouchableOpacity
                      onPress={handleResetOnboarding}
                      activeOpacity={0.85}
                      className="flex-row items-center gap-2 rounded-full bg-slate-900 px-4 py-2 dark:bg-blue-500">
                      <MaterialCommunityIcons name="refresh" size={16} color="#ffffff" />
                      <Text className="text-sm font-semibold text-white">
                        {t('developerTools.resetOnboarding.title')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleRestoreMockTools}
                activeOpacity={0.85}
                className="flex-row items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-300 bg-white/70 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/40">
                <MaterialCommunityIcons name="beaker-check" size={18} color="#2563eb" />
                <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t('dashboard.mockDetection.showTools')}
                </Text>
              </TouchableOpacity>
            )
          ) : null}
        </View>
      </ScrollView>
      <AppModal
        isVisible={Boolean(selectedDetection)}
        onClose={() => setSelectedDetection(null)}
        testID="detection-detail-modal">
        <View className="flex-1 justify-end">
          <View className="w-full rounded-t-3xl bg-white p-6 dark:bg-slate-900">
            {selectedDetection ? (
              <View className="space-y-4">
                <View className="flex-row items-center justify-between">
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

                {selectedDetectionTrustedSource ? (
                  <View className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-200">
                      {t('dashboard.recentAlerts.trustedBadge')}
                    </Text>
                    <Text className="mt-1 text-sm text-emerald-700 dark:text-emerald-200">
                      {selectedDetectionTrustedSource.note ??
                        t('dashboard.recentAlerts.trustedDefault')}
                    </Text>
                  </View>
                ) : null}

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
              </View>
            ) : null}
          </View>
        </View>
      </AppModal>

      <ReportMessageModal
        isVisible={isReportModalVisible}
        onClose={() => setIsReportModalVisible(false)}
      />

      <AppModal isVisible={Boolean(safePreview)} onClose={() => setSafePreview(null)}>
        <View className="flex-1 justify-end">
          <View className="w-full rounded-t-3xl bg-white p-6 dark:bg-slate-900">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t('dashboard.mockDetection.safePreviewTitle')}
              </Text>
              <TouchableOpacity onPress={() => setSafePreview(null)} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t('dashboard.mockDetection.safePreviewSubtitle')}
            </Text>
            {safePreview ? (
              <View className="mt-4 space-y-3">
                <View className="flex-row items-center gap-2">
                  <MaterialCommunityIcons name="shield-check" size={20} color="#22c55e" />
                  <Text className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {t('dashboard.mockDetection.safePreviewLabel')}
                  </Text>
                </View>
                <Text className="text-sm text-slate-600 dark:text-slate-200" numberOfLines={4}>
                  “{safePreview.message.body}”
                </Text>
                <View className="flex-row flex-wrap items-center gap-3">
                  <Text className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
                    {t(`dashboard.mockDetection.channels.${safePreview.message.channel}`)}
                  </Text>
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('dashboard.mockDetection.scoreLabel', {
                      score: Math.round(safePreview.score * 100),
                    })}
                  </Text>
                </View>
                {safePreview.matches.length ? (
                  <View className="space-y-2">
                    {safePreview.matches.map((match, index) => (
                      <View
                        key={`safe-${match.label}-${index}`}
                        className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/80">
                        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {match.label}
                        </Text>
                        <Text className="mt-1 text-sm text-slate-600 dark:text-slate-200">
                          “{match.excerpt || match.label}”
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/80">
                    <Text className="text-sm text-slate-600 dark:text-slate-200">
                      {t('dashboard.mockDetection.noMatches')}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>
        </View>
      </AppModal>
    </SafeAreaView>
  );
}
