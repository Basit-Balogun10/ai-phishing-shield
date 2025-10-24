import { Link, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, Platform, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import NotificationListener from '../../mobile/notifications/notificationListener';
import { processIncomingNotification } from '../../lib/services/notificationHandler';
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
import { formatDetectionTimestamp } from '../../lib/detection/formatters';
import notificationFilter from '../../lib/services/notificationFilter';

const MOCK_TOOLS_DISMISS_KEY = 'dashboard_mock_tools_dismissed_v1';

const HERO_BASE_CONTAINER = 'rounded-3xl px-5 py-5 shadow-sm shadow-blue-900/10 dark:shadow-none';
const HERO_ACTIVE_BG = 'bg-blue-600 dark:bg-blue-500';
const HERO_PAUSED_BG = 'bg-amber-500 opacity-70';
const HERO_BADGE_CONTAINER = 'flex-row items-center gap-1 rounded-full bg-white/15 px-3 py-1';
const HERO_BADGE_TEXT = 'text-xs font-semibold uppercase tracking-wide text-white';
const QUICK_ACTION_CARD =
  'flex-1 min-w-[48%] rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm shadow-slate-900/5 dark:border-slate-700 dark:bg-slate-900/60';
const QUICK_ACTION_ICON = 'mb-3 h-12 w-12 items-center justify-center rounded-2xl';

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
  const { checking, allowed, permissionsSatisfied } = useOnboardingGate();
  const { lastSimulated } = useDetectionHistory();
  const {
    ready: modelReady,
    status: modelStatus,
    activeOperation: modelOperation,
  } = useModelManager();
  const { ready: telemetryReady, preferences: telemetryPreferences } = useTelemetryPreferences();
  const { sources: trustedSources } = useTrustedSources();
  const { ready: shieldReady, paused: shieldPaused } = useShieldState();
  const [isTriggeringDetection, setIsTriggeringDetection] = useState(false);
  const [isUpdatingShield, setIsUpdatingShield] = useState(false);
  const [optimisticShieldPaused, setOptimisticShieldPaused] = useState<boolean | null>(null);
  const [selectedDetection, setSelectedDetection] = useState<DetectionRecord | null>(null);
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const mockToolsEnabled = resolveMockToolsEnabled();
  const [showMockTools, setShowMockTools] = useState(false);
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
  const displayedShieldPaused = optimisticShieldPaused ?? shieldPaused;
  const permissionsMissing = !checking && (!allowed || !permissionsSatisfied);
  const heroStatusLabel = permissionsMissing
    ? t('dashboard.hero.permissions.missing')
    : displayedShieldPaused
      ? t('dashboard.hero.status.paused')
      : t('dashboard.hero.status.active');
  const heroMessage = permissionsMissing
    ? t('dashboard.hero.pausedDescription')
    : displayedShieldPaused
      ? t('dashboard.hero.pausedHelper')
      : t('dashboard.hero.activeDescription');
  const heroBgClass = displayedShieldPaused || permissionsMissing ? HERO_PAUSED_BG : HERO_ACTIVE_BG;
  const shieldSwitchValue = permissionsMissing ? false : !displayedShieldPaused;
  const shieldIconName = permissionsMissing
    ? 'shield-alert'
    : shieldSwitchValue
      ? 'shield-check'
      : 'shield-off-outline';
  const heroSwitchOnColor = 'rgba(59, 130, 246, 0.55)';
  const heroSwitchOffColor = '#f59e0b';
  const disabledSwitchColor = 'rgba(148, 163, 184, 0.35)';
  const switchTrackColors = permissionsMissing
    ? { false: disabledSwitchColor, true: disabledSwitchColor }
    : { false: heroSwitchOffColor, true: heroSwitchOnColor };
  const switchThumbColor =
    Platform.OS === 'android'
      ? permissionsMissing
        ? '#e2e8f0'
        : shieldSwitchValue
          ? '#ffffff'
          : '#fef3c7'
      : undefined;
  const iosSwitchBackground = permissionsMissing ? disabledSwitchColor : heroSwitchOffColor;
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
    trackTelemetryEvent('dashboard.quick_action.alerts_opened', undefined);
    router.push('/alerts');
  }, [router]);

  const handleOpenStats = useCallback(() => {
    trackTelemetryEvent('dashboard.quick_action.stats_opened', undefined);
    router.push('/stats');
  }, [router]);

  const handleManageTrustedSources = useCallback(() => {
    trackTelemetryEvent('dashboard.quick_action.trusted_sources_opened', undefined);
    router.push('/(tabs)/settings/trusted');
  }, [router]);

  const handleOpenModelManager = useCallback(() => {
    trackTelemetryEvent('settings.model.manage_opened', { source: 'dashboard_quick_action' });
    router.push('/(tabs)/settings/model');
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

  const handleToggleShield = useCallback(async () => {
    if (isUpdatingShield || !shieldReady || permissionsMissing) {
      return;
    }

    const currentPaused = optimisticShieldPaused ?? shieldPaused;
    const nextPaused = !currentPaused;

    try {
      setIsUpdatingShield(true);
      setOptimisticShieldPaused(nextPaused);
      await shieldStateStore.setPaused(nextPaused);
      trackTelemetryEvent('dashboard.shield_toggled', {
        paused: nextPaused,
      });
      // Start or stop the notification listener based on shield state
      try {
        if (!nextPaused) {
          // enabling shield -> start listener
          await NotificationListener.init();
          const granted = await NotificationListener.isPermissionGranted();
          if (!granted) {
            // attempt to request permission; user may need to grant in OS settings
            await NotificationListener.requestPermission();
          }
          // start listening; register a lightweight handler that logs telemetry.
          await NotificationListener.start();
          // register onNotification handler; ensure we unsubscribe any previous handler
          // We create a local handler that will optionally trigger the mock detection in dev.
          NotificationListener.onNotification(async (payload) => {
            try {
              // Process incoming notification: convert to detection format and run analysis.
              await processIncomingNotification(payload as Record<string, any>);
            } catch {
              // ignore
            }
          });
          // store unsubscribe on AsyncStorage so we can clear if needed; keep ephemeral here
          // (we don't persist the callback between reloads)
        } else {
          // disabling shield -> stop listener
          try {
            await NotificationListener.stop();
          } catch {
            // ignore
          }
        }
      } catch {
        console.warn('[dashboard] Notification listener start/stop failed');
      }
    } catch (error) {
      console.warn('[dashboard] Failed to toggle shield', error);
      setOptimisticShieldPaused(currentPaused);
      Alert.alert(t('dashboard.report.status.errorTitle'), t('dashboard.report.status.error'));
    } finally {
      setIsUpdatingShield(false);
    }
  }, [isUpdatingShield, optimisticShieldPaused, permissionsMissing, shieldPaused, shieldReady, t]);

  useEffect(() => {
    // initialize listener on mount (no-op on non-Android)
    void (async () => {
      try {
        // prefer native bridge when available
        await NotificationListener.init();
      } catch {
        // ignore
      }
    })();
  }, []);

  const quickActions = useMemo(
    () => [
      {
        key: 'alerts' as const,
        icon: 'bell-alert-outline',
        title: t('dashboard.quickActions.alerts.title'),
        subtitle: t('dashboard.quickActions.alerts.subtitle'),
        action: handleHistoryPress,
        iconBg: 'bg-rose-50 dark:bg-rose-500/15',
        iconColor: '#e11d48',
      },
      {
        key: 'stats' as const,
        icon: 'chart-timeline-variant',
        title: t('dashboard.quickActions.stats.title'),
        subtitle: t('dashboard.quickActions.stats.subtitle'),
        action: handleOpenStats,
        iconBg: 'bg-blue-50 dark:bg-blue-500/20',
        iconColor: '#2563eb',
      },
      {
        key: 'trusted' as const,
        icon: 'shield-account',
        title: t('dashboard.quickActions.trusted.title'),
        subtitle: t('dashboard.quickActions.trusted.subtitle'),
        action: handleManageTrustedSources,
        iconBg: 'bg-emerald-50 dark:bg-emerald-500/20',
        iconColor: '#059669',
      },
      {
        key: 'model' as const,
        icon: 'database-sync',
        title: t('dashboard.quickActions.model.title'),
        subtitle: t('dashboard.quickActions.model.subtitle'),
        action: handleOpenModelManager,
        iconBg: 'bg-violet-50 dark:bg-violet-500/20',
        iconColor: '#6d28d9',
      },
    ],
    [handleHistoryPress, handleManageTrustedSources, handleOpenModelManager, handleOpenStats, t]
  );

  const formatDetectedAt = useCallback(
    (value: string) => formatDetectionTimestamp(value, i18n.language),
    [i18n.language]
  );

  useEffect(() => {
    setOptimisticShieldPaused(null);
  }, [shieldPaused]);

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

  const handleIgnoreApp = useCallback(async (pkg?: string, sender?: string) => {
    const target = pkg || sender;
    if (!target) return;

    Alert.alert(
      t('dashboard.mockDetection.ignoreConfirmTitle'),
      t('dashboard.mockDetection.ignoreConfirmBody', { app: target }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          onPress: async () => {
            try {
              await notificationFilter.addIgnoredPackage(target);
              Alert.alert(t('dashboard.mockDetection.ignoreSuccessTitle'), t('dashboard.mockDetection.ignoreSuccessBody'));
            } catch (e) {
              console.warn('[dashboard] Failed to ignore package', e);
            }
          },
        },
      ]
    );
  }, [t]);

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="border-b border-slate-200/70 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
        <Text className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
          {t('dashboard.title')}
        </Text>
        <Text className="mt-2 text-base text-slate-600 dark:text-slate-400">
          {t('dashboard.subtitle')}
        </Text>
      </View>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}>
        <View className="gap-6">
          <View className={`${HERO_BASE_CONTAINER} ${heroBgClass}`}>
            <View className="gap-5">
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <View className="flex-row flex-wrap items-center gap-2">
                  <View className={HERO_BADGE_CONTAINER}>
                    <MaterialCommunityIcons
                      name={shieldIconName as any}
                      size={14}
                      color="#ffffff"
                    />
                    <Text className={HERO_BADGE_TEXT}>{heroStatusLabel}</Text>
                  </View>
                  {modelStatusLabel && !permissionsMissing ? (
                    <View className="rounded-full bg-white/10 px-3 py-1">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-white/80">
                        {modelStatusLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Switch
                  value={shieldSwitchValue}
                  onValueChange={handleToggleShield}
                  disabled={!shieldReady || isUpdatingShield || permissionsMissing}
                  accessibilityLabel={
                    permissionsMissing
                      ? t('dashboard.hero.permissions.missing')
                      : shieldSwitchValue
                        ? t('dashboard.hero.status.active')
                        : t('dashboard.hero.status.paused')
                  }
                  trackColor={switchTrackColors}
                  thumbColor={switchThumbColor}
                  ios_backgroundColor={iosSwitchBackground}
                />
              </View>

              <View className="gap-3">
                <Text className="text-lg font-semibold text-white">{heroMessage}</Text>
                {permissionsMissing ? (
                  <Link href="/settings" asChild>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      className="w-full max-w-[240px] rounded-full bg-white/15 px-4 py-2">
                      <Text className="text-center text-xs font-semibold uppercase tracking-wide text-white">
                        {t('dashboard.permissionsReminder.cta')}
                      </Text>
                    </TouchableOpacity>
                  </Link>
                ) : null}
              </View>
            </View>
          </View>

          <View className="gap-3">
            <Text className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('dashboard.quickActions.title')}
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {quickActions.map((action) => {
                const iconBgClass = `${QUICK_ACTION_ICON} ${action.iconBg ?? 'bg-blue-50 dark:bg-blue-500/20'}`;
                const iconColor = action.iconColor ?? '#2563eb';

                return (
                  <TouchableOpacity
                    key={action.key}
                    onPress={action.action}
                    activeOpacity={0.85}
                    className={QUICK_ACTION_CARD}>
                    <View className={iconBgClass}>
                      <MaterialCommunityIcons
                        name={action.icon as any}
                        size={22}
                        color={iconColor}
                      />
                    </View>
                    <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {action.title}
                    </Text>
                    <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                      {action.subtitle}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
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
                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        onPress={() => handleIgnoreApp(selectedDetection.result.message.package, selectedDetection.result.message.sender)}
                        activeOpacity={0.7}
                        className="mr-2 rounded-full bg-slate-100 px-3 py-2 dark:bg-slate-800">
                        <Text className="text-xs text-slate-700 dark:text-slate-200">{t('dashboard.mockDetection.ignoreApp')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setSelectedDetection(null)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={t('dashboard.report.actions.close')}
                        className="h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <MaterialCommunityIcons name="close" size={20} color="#475569" />
                      </TouchableOpacity>
                    </View>
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
