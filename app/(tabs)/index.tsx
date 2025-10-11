import { Link, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Platform,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type StatTimeframe = '24h' | '7d' | '30d' | 'all';
type AlertFilter = 'all' | 'historical' | 'simulated' | 'trusted';

type DashboardStat = {
  key: 'messagesScanned' | 'threatsBlocked' | 'safeMessages';
  label: string;
  value: string;
  helper: string;
  trendLabel: string;
  trendValue: number;
  direction: 'up' | 'down' | 'flat';
};

const TIMEFRAME_KEYS: StatTimeframe[] = ['24h', '7d', '30d', 'all'];
const TIMEFRAME_RANGES_MS: Record<StatTimeframe, number | null> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  all: null,
};
const EXPO_NOTICE_KEY = 'dashboard_expo_go_notice_dismissed_v1';
const STAT_ICONS: Record<DashboardStat['key'], string> = {
  messagesScanned: 'email-receive-outline',
  threatsBlocked: 'shield-alert',
  safeMessages: 'shield-check-outline',
};

const SECTION_WRAPPER = 'rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900';
const SECTION_TITLE = 'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const SECTION_SUBTITLE = 'text-sm text-slate-500 dark:text-slate-400';

export default function DashboardScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { checking, allowed, permissionsSatisfied } = useOnboardingGate();
  const {
    merged: detectionHistory,
    simulated: simulatedDetections,
    lastSimulated,
  } = useDetectionHistory();
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
  const [selectedStat, setSelectedStat] = useState<DashboardStat['key'] | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<StatTimeframe>('7d');
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all');
  const [isExpoNoticeDismissed, setIsExpoNoticeDismissed] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  type SectionPositions = {
    stats: number;
    alerts: number;
    mock: number;
    trusted: number;
  };
  const [sectionPositions, setSectionPositions] = useState<SectionPositions>({
    stats: 0,
    alerts: 0,
    mock: 0,
    trusted: 0,
  });
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
  const activeModelVersion = activeModel?.version ?? 'v0.1.0';
  const protectionActive = permissionsSatisfied && !shieldPaused;
  const heroStatusLabel = protectionActive
    ? t('dashboard.hero.status.active')
    : t('dashboard.hero.status.paused');
  const heroDescription = protectionActive
    ? t('dashboard.statusCard.description')
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
  const isExpoGo = Constants.appOwnership === 'expo';
  useEffect(() => {
    if (!isExpoGo) {
      return;
    }

    AsyncStorage.getItem(EXPO_NOTICE_KEY)
      .then((value) => {
        if (value === 'true') {
          setIsExpoNoticeDismissed(true);
        }
      })
      .catch((error) => {
        console.warn('[dashboard] Failed to load Expo notice state', error);
      });
  }, [isExpoGo]);

  const mockMessages = useMemo(() => getMockMessages(), []);
  const messageAnalyses = useMemo(
    () => mockMessages.map((message) => analyzeMessage(message)),
    [mockMessages]
  );

  const handleDismissExpoNotice = useCallback(() => {
    setIsExpoNoticeDismissed(true);
    AsyncStorage.setItem(EXPO_NOTICE_KEY, 'true').catch((error) => {
      console.warn('[dashboard] Failed to persist Expo notice dismissal', error);
    });
  }, []);

  const handleSectionLayout = useCallback(
    (key: keyof SectionPositions) => (event: LayoutChangeEvent) => {
      const { y } = event.nativeEvent.layout;
      setSectionPositions((prev) => ({
        ...prev,
        [key]: y,
      }));
    },
    []
  );

  const scrollToSection = useCallback((position: number) => {
    if (!scrollViewRef.current) {
      return;
    }

    scrollViewRef.current.scrollTo({ y: Math.max(position - 24, 0), animated: true });
  }, []);

  const handleQuickActionMock = useCallback(() => {
    scrollToSection(sectionPositions.mock);
  }, [scrollToSection, sectionPositions.mock]);

  const handleHistoryPress = useCallback(() => {
    router.push('/alerts');
  }, [router]);

  const handleOpenSettings = useCallback(() => {
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
      Alert.alert(
        t('dashboard.report.status.errorTitle'),
        t('dashboard.report.status.error')
      );
    } finally {
      setIsUpdatingShield(false);
    }
  }, [isUpdatingShield, shieldPaused, shieldReady, t]);

  const quickActions = useMemo(
    () => [
      {
        key: 'mock' as const,
        icon: 'beaker-check',
        title: t('dashboard.quickActions.mockScan.title'),
        subtitle: t('dashboard.quickActions.mockScan.subtitle'),
        action: handleQuickActionMock,
      },
      {
        key: 'report' as const,
        icon: 'email-alert-outline',
        title: t('dashboard.report.title'),
        subtitle: t('dashboard.report.subtitle'),
        action: handleReportPress,
      },
      {
        key: 'alerts' as const,
        icon: 'bell-alert-outline',
        title: t('dashboard.quickActions.alerts.title'),
        subtitle: t('dashboard.quickActions.alerts.subtitle'),
        action: handleHistoryPress,
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
      handleOpenModelManager,
      handleOpenSettings,
      handleQuickActionMock,
      handleReportPress,
      t,
    ]
  );

  const timelineLatest = useMemo(() => {
    const datasetMax = messageAnalyses.reduce((max, analysis) => {
      const timestamp = new Date(analysis.message.receivedAt).getTime();
      if (Number.isNaN(timestamp)) {
        return max;
      }
      return Math.max(max, timestamp);
    }, 0);

    const detectionMax = detectionHistory.reduce((max, record) => {
      const timestamp = new Date(record.detectedAt).getTime();
      if (Number.isNaN(timestamp)) {
        return max;
      }
      return Math.max(max, timestamp);
    }, 0);

    return Math.max(datasetMax || 0, detectionMax, Date.now());
  }, [detectionHistory, messageAnalyses]);

  const timeframeRange = TIMEFRAME_RANGES_MS[selectedTimeframe];

  const timeframeBoundary = useMemo(() => {
    if (!timeframeRange) {
      return null;
    }

    return timelineLatest - timeframeRange;
  }, [timeframeRange, timelineLatest]);

  const scopedAnalyses = useMemo(() => {
    if (!timeframeBoundary) {
      return messageAnalyses;
    }

    return messageAnalyses.filter((analysis) => {
      const timestamp = new Date(analysis.message.receivedAt).getTime();
      if (Number.isNaN(timestamp)) {
        return true;
      }
      return timestamp >= timeframeBoundary;
    });
  }, [messageAnalyses, timeframeBoundary]);

  const previousAnalyses = useMemo(() => {
    if (!timeframeBoundary || !timeframeRange) {
      return [];
    }

    const previousStart = timeframeBoundary - timeframeRange;

    return messageAnalyses.filter((analysis) => {
      const timestamp = new Date(analysis.message.receivedAt).getTime();
      if (Number.isNaN(timestamp)) {
        return false;
      }
      return timestamp >= previousStart && timestamp < timeframeBoundary;
    });
  }, [messageAnalyses, timeframeBoundary, timeframeRange]);

  const safeSamples = useMemo(
    () => messageAnalyses.filter((analysis) => analysis.score < 0.6),
    [messageAnalyses]
  );

  const scopedDetectionCount = useMemo(
    () => scopedAnalyses.filter((analysis) => analysis.score >= 0.6).length,
    [scopedAnalyses]
  );

  const previousDetectionCountBase = useMemo(
    () => previousAnalyses.filter((analysis) => analysis.score >= 0.6).length,
    [previousAnalyses]
  );

  const simulatedWithinCurrentRange = useMemo(() => {
    if (!timeframeBoundary) {
      return simulatedDetections;
    }

    return simulatedDetections.filter((record) => {
      const timestamp = new Date(record.detectedAt).getTime();
      if (Number.isNaN(timestamp)) {
        return false;
      }
      return timestamp >= timeframeBoundary;
    });
  }, [simulatedDetections, timeframeBoundary]);

  const simulatedWithinPreviousRange = useMemo(() => {
    if (!timeframeBoundary || !timeframeRange) {
      return 0;
    }

    const previousStart = timeframeBoundary - timeframeRange;

    return simulatedDetections.filter((record) => {
      const timestamp = new Date(record.detectedAt).getTime();
      if (Number.isNaN(timestamp)) {
        return false;
      }
      return timestamp >= previousStart && timestamp < timeframeBoundary;
    }).length;
  }, [simulatedDetections, timeframeBoundary, timeframeRange]);

  const totalDetectionsCount = scopedDetectionCount + simulatedWithinCurrentRange.length;
  const totalScannedCount = scopedAnalyses.length + simulatedWithinCurrentRange.length;
  const safeCount = Math.max(totalScannedCount - totalDetectionsCount, 0);

  const previousScanCount = previousAnalyses.length + simulatedWithinPreviousRange;
  const previousDetectionCount = previousDetectionCountBase + simulatedWithinPreviousRange;
  const previousSafeCount = Math.max(previousScanCount - previousDetectionCount, 0);

  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);
  const timeframeLabel = t(`dashboard.stats.timeframes.${selectedTimeframe}`);

  const computeTrend = useCallback(
    (current: number, previous: number) => {
      if (!previous && !current) {
        return { direction: 'flat' as const, label: t('dashboard.stats.trend.flat'), value: 0 };
      }

      if (!previous) {
        return {
          direction: 'up' as const,
          label: t('dashboard.stats.trend.up', { value: 100 }),
          value: 100,
        };
      }

      const delta = ((current - previous) / previous) * 100;
      const rounded = Math.round(Math.abs(delta));

      if (rounded === 0) {
        return { direction: 'flat' as const, label: t('dashboard.stats.trend.flat'), value: 0 };
      }

      if (delta > 0) {
        return {
          direction: 'up' as const,
          label: t('dashboard.stats.trend.up', { value: rounded }),
          value: rounded,
        };
      }

      return {
        direction: 'down' as const,
        label: t('dashboard.stats.trend.down', { value: rounded }),
        value: rounded,
      };
    },
    [t]
  );

  const stats = useMemo<DashboardStat[]>(() => {
    const scanTrend = computeTrend(totalScannedCount, previousScanCount);
    const detectionTrend = computeTrend(totalDetectionsCount, previousDetectionCount);
    const safeTrend = computeTrend(safeCount, previousSafeCount);

    return [
      {
        key: 'messagesScanned',
        label: t('dashboard.stats.messagesScanned'),
        value: numberFormatter.format(totalScannedCount),
        helper: t('dashboard.stats.since', { timeframe: timeframeLabel }),
        trendLabel: scanTrend.label,
        trendValue: scanTrend.value,
        direction: scanTrend.direction,
      },
      {
        key: 'threatsBlocked',
        label: t('dashboard.stats.threatsBlocked'),
        value: numberFormatter.format(totalDetectionsCount),
        helper: t('dashboard.stats.since', { timeframe: timeframeLabel }),
        trendLabel: detectionTrend.label,
        trendValue: detectionTrend.value,
        direction: detectionTrend.direction,
      },
      {
        key: 'safeMessages',
        label: t('dashboard.stats.safeMessages'),
        value: numberFormatter.format(safeCount),
        helper: t('dashboard.stats.since', { timeframe: timeframeLabel }),
        trendLabel: safeTrend.label,
        trendValue: safeTrend.value,
        direction: safeTrend.direction,
      },
    ];
  }, [
    computeTrend,
    numberFormatter,
    previousDetectionCount,
    previousSafeCount,
    previousScanCount,
    safeCount,
    t,
    timeframeLabel,
    totalDetectionsCount,
    totalScannedCount,
  ]);

  const statsLength = stats.length;

  const detectionEntries = useMemo(() => detectionHistory, [detectionHistory]);

  const filteredDetectionEntries = useMemo(() => {
    switch (alertFilter) {
      case 'historical':
        return detectionEntries.filter((entry) => entry.source === 'historical');
      case 'simulated':
        return detectionEntries.filter((entry) => entry.source === 'simulated');
      case 'trusted':
        return detectionEntries.filter((entry) =>
          Boolean(getTrustedSource(entry.result.message.sender, entry.result.message.channel))
        );
      default:
        return detectionEntries;
    }
  }, [alertFilter, detectionEntries, getTrustedSource]);

  const alertFilterOptions = useMemo(
    () => [
      { key: 'all' as const, label: t('dashboard.recentAlerts.filters.all') },
      { key: 'historical' as const, label: t('dashboard.recentAlerts.filters.historical') },
      { key: 'simulated' as const, label: t('dashboard.recentAlerts.filters.simulated') },
      { key: 'trusted' as const, label: t('dashboard.recentAlerts.filters.trusted') },
    ],
    [t]
  );

  const activeFilterLabel = useMemo(() => {
    const match = alertFilterOptions.find((option) => option.key === alertFilter);
    return match?.label ?? '';
  }, [alertFilter, alertFilterOptions]);

  const emptyAlertsMessage = useMemo(() => {
    if (alertFilter === 'all') {
      return t('dashboard.recentAlerts.empty');
    }

    return t('dashboard.recentAlerts.emptyWithFilters', { filters: activeFilterLabel });
  }, [activeFilterLabel, alertFilter, t]);

  const formatDetectedAt = useCallback(
    (value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }

      const now = new Date(timelineLatest);
      const sameDay = date.toDateString() === now.toDateString();

      const timePart = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      if (sameDay) {
        return timePart;
      }

      const datePart = date.toLocaleDateString();
      return `${datePart} • ${timePart}`;
    },
    [timelineLatest]
  );

  const getSeverityColor = useCallback((score: number) => {
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
  }, []);

  const lastScanText = useMemo(() => {
    if (!detectionEntries.length) {
      return t('dashboard.hero.lastScanFallback');
    }

    return formatDetectedAt(detectionEntries[0].detectedAt);
  }, [detectionEntries, formatDetectedAt, t]);

  const latestActivity = detectionEntries[0] ?? null;

  const latestActivityTrustedSource = useMemo(() => {
    if (!latestActivity) {
      return null;
    }

    return getTrustedSource(
      latestActivity.result.message.sender,
      latestActivity.result.message.channel
    );
  }, [getTrustedSource, latestActivity]);

  const topTrustedSources = useMemo(() => trustedSources.slice(0, 2), [trustedSources]);

  const statModalContent = useMemo(() => {
    if (!selectedStat) {
      return null;
    }

    switch (selectedStat) {
      case 'messagesScanned':
        return {
          title: t('dashboard.modals.messagesScanned.title'),
          body: t('dashboard.modals.messagesScanned.body'),
        };
      case 'threatsBlocked':
        return {
          title: t('dashboard.modals.threatsBlocked.title'),
          body: t('dashboard.modals.threatsBlocked.body'),
        };
      case 'safeMessages':
        return {
          title: t('dashboard.modals.safeMessages.title'),
          body: t('dashboard.modals.safeMessages.body'),
        };
      default:
        return null;
    }
  }, [selectedStat, t]);

  const handleCloseStatModal = useCallback(() => {
    setSelectedStat(null);
  }, []);

  const getTrendBadgeStyle = useCallback((direction: DashboardStat['direction']) => {
    switch (direction) {
      case 'up':
        return {
          container: 'bg-emerald-500/15 dark:bg-emerald-500/20',
          text: 'text-emerald-600 dark:text-emerald-200',
          icon: '#059669',
        };
      case 'down':
        return {
          container: 'bg-rose-500/15 dark:bg-rose-500/20',
          text: 'text-rose-600 dark:text-rose-200',
          icon: '#dc2626',
        };
      default:
        return {
          container: 'bg-slate-500/10 dark:bg-slate-500/20',
          text: 'text-slate-600 dark:text-slate-200',
          icon: '#64748b',
        };
    }
  }, []);

  const showExpoNotice = isExpoGo && !isExpoNoticeDismissed;

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

  if (checking) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          {t('common.loading')}
        </Text>
      </SafeAreaView>
    );
  }

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
        ref={scrollViewRef}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 24 }}>
        <View className="gap-6">
          {showExpoNotice ? (
            <View className="flex-row items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/30">
                <MaterialCommunityIcons name="information-outline" size={24} color="#d97706" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {t('dashboard.expoGoNotice.title')}
                </Text>
                <Text className="mt-1 text-sm text-amber-800/90 dark:text-amber-100/90">
                  {t('dashboard.expoGoNotice.body')}
                </Text>
                <TouchableOpacity
                  onPress={handleDismissExpoNotice}
                  activeOpacity={0.75}
                  className="mt-3 self-start rounded-full border border-amber-300 px-3 py-1 dark:border-amber-500/60">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">
                    {t('common.clear')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

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
              <View className="flex-1 space-y-3">
                <View>
                  <Text className="text-xs font-semibold uppercase tracking-wide text-blue-100">
                    {heroStatusLabel}
                  </Text>
                  <Text className="mt-1 text-lg font-semibold text-white">{heroDescription}</Text>
                </View>
                <View className="flex-row flex-wrap items-center gap-3">
                  <View className="rounded-full bg-white/10 px-3 py-1">
                    <Text className="text-xs font-medium uppercase tracking-wide text-blue-50">
                      {t('dashboard.hero.modelVersion', { version: activeModelVersion })}
                    </Text>
                  </View>
                  {modelStatusLabel ? (
                    <View className="rounded-full bg-white/10 px-3 py-1">
                      <Text className="text-xs font-medium uppercase tracking-wide text-blue-50">
                        {modelStatusLabel}
                      </Text>
                    </View>
                  ) : null}
                  <View className="rounded-full bg-white/10 px-3 py-1">
                    <Text className="text-xs font-medium uppercase tracking-wide text-blue-50">
                      {t('dashboard.hero.lastScan', { time: lastScanText })}
                    </Text>
                  </View>
                  {!permissionsSatisfied ? (
                    <View className="rounded-full bg-amber-500/30 px-3 py-1">
                      <Text className="text-xs font-medium uppercase tracking-wide text-blue-50">
                        {t('dashboard.hero.permissions.missing')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View className="items-end gap-4">
                <View className="flex-row items-center gap-2 rounded-full bg-white/10 px-3 py-2">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-blue-50">
                    {shieldPaused
                      ? t('dashboard.hero.status.paused')
                      : t('dashboard.hero.status.active')}
                  </Text>
                  <Switch
                    value={!shieldPaused}
                    onValueChange={handleToggleShield}
                    disabled={!shieldReady || isUpdatingShield}
                    trackColor={{ false: '#94a3b8', true: '#22c55e' }}
                    thumbColor={
                      Platform.OS === 'ios' ? undefined : shieldPaused ? '#f4f4f5' : '#ffffff'
                    }
                  />
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
            <TouchableOpacity
              onPress={() => router.push('/settings/diagnostics')}
              activeOpacity={0.8}
              className="mt-6 inline-flex self-start rounded-full border border-white/30 px-4 py-2">
              <Text className="text-xs font-semibold uppercase tracking-wide text-blue-50">
                {t('dashboard.hero.goToDiagnostics')}
              </Text>
            </TouchableOpacity>
          </View>

          <View className={SECTION_WRAPPER}>
            <Text className={SECTION_TITLE}>{t('dashboard.quickActions.title')}</Text>
            <View className="mt-4 flex-row flex-wrap gap-3">
              {quickActions.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  onPress={action.action}
                  activeOpacity={0.85}
                  className="flex-1 min-w-[48%] rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/60">
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
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <Text className={SECTION_TITLE}>{t('dashboard.stats.title')}</Text>
              <View className="flex-row flex-wrap gap-2">
                {TIMEFRAME_KEYS.map((key) => {
                  const label = t(`dashboard.stats.timeframes.${key}`);
                  const isActive = selectedTimeframe === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setSelectedTimeframe(key)}
                      activeOpacity={0.85}
                      className={`rounded-full border px-3 py-1 ${
                        isActive
                          ? 'border-blue-500 bg-blue-500/10 dark:border-blue-400/80 dark:bg-blue-400/20'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                      }`}>
                      <Text
                        className={`text-xs font-semibold uppercase tracking-wide ${
                          isActive
                            ? 'text-blue-600 dark:text-blue-300'
                            : 'text-slate-500 dark:text-slate-300'
                        }`}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View className="mt-4 flex-row flex-wrap justify-between gap-3">
              {stats.map((stat) => {
                const trendIcon =
                  stat.direction === 'up'
                    ? 'arrow-up'
                    : stat.direction === 'down'
                      ? 'arrow-down'
                      : 'minus';
                const trendBadge = getTrendBadgeStyle(stat.direction);
                const cardStyles = statsLength > 1 ? 'w-full md:w-[48%] lg:w-[31%]' : 'w-full';
                const trendBadgeLabel =
                  stat.direction === 'flat'
                    ? t('dashboard.stats.trendBadges.flat')
                    : t(`dashboard.stats.trendBadges.${stat.direction}`, {
                        value: stat.trendValue,
                      });

                return (
                  <TouchableOpacity
                    key={stat.key}
                    onPress={() => setSelectedStat(stat.key)}
                    activeOpacity={0.85}
                    className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${cardStyles}`}>
                    <View className="flex-row items-center justify-between">
                      <View className="h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/20">
                        <MaterialCommunityIcons
                          name={STAT_ICONS[stat.key] as any}
                          size={20}
                          color="#1d4ed8"
                        />
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={18} color="#64748b" />
                    </View>
                    <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {stat.label}
                    </Text>
                    <Text className="mt-1 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                      {stat.value}
                    </Text>
                    <View className="mt-3 flex-row items-center gap-2">
                      <View
                        className={`flex-row items-center gap-1 rounded-full px-3 py-1 ${trendBadge.container}`}>
                        <MaterialCommunityIcons
                          name={trendIcon as any}
                          size={14}
                          color={trendBadge.icon}
                        />
                        <Text className={`text-xs font-semibold ${trendBadge.text}`}>
                          {trendBadgeLabel}
                        </Text>
                      </View>
                      <Text className="text-xs text-slate-500 dark:text-slate-400">
                        {t('dashboard.stats.comparison')}
                      </Text>
                    </View>
                    <Text className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                      {stat.helper}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {latestActivity ? (
            <TouchableOpacity
              onPress={() => setSelectedDetection(latestActivity)}
              activeOpacity={0.85}
              className={`${SECTION_WRAPPER} space-y-2`}>
              <View className="flex-row items-center justify-between">
                <Text className={SECTION_TITLE}>{t('dashboard.activity.title')}</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#64748b" />
              </View>
              <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {latestActivity.result.message.sender}
              </Text>
              <Text className={SECTION_SUBTITLE} numberOfLines={2}>
                {latestActivity.result.message.body}
              </Text>
              <View className="flex-row flex-wrap items-center gap-2">
                <View className="rounded-full bg-blue-50 px-3 py-1 dark:bg-blue-500/20">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
                    {t(`dashboard.mockDetection.channels.${latestActivity.result.message.channel}`)}
                  </Text>
                </View>
                <Text className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {formatDetectedAt(latestActivity.detectedAt)}
                </Text>
                {latestActivityTrustedSource ? (
                  <View className="flex-row items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 dark:bg-emerald-500/20">
                    <MaterialCommunityIcons name="shield-check" size={14} color="#059669" />
                    <Text className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                      {t('dashboard.recentAlerts.trustedBadge')}
                    </Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          ) : (
            <View className={`${SECTION_WRAPPER} items-center justify-center gap-3 text-center`}>
              <Text className={SECTION_SUBTITLE}>{t('dashboard.activity.empty')}</Text>
              <TouchableOpacity
                onPress={handleQuickActionMock}
                activeOpacity={0.85}
                className="rounded-full bg-slate-900 px-5 py-2 dark:bg-blue-500">
                <Text className="text-sm font-semibold text-white">
                  {t('dashboard.quickActions.mockScan.title')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View className={SECTION_WRAPPER}>
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className={SECTION_TITLE}>{t('dashboard.recentAlerts.title')}</Text>
                <Text className={SECTION_SUBTITLE}>{t('dashboard.recentAlerts.subtitle')}</Text>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {alertFilterOptions.map((option) => {
                    const isActive = alertFilter === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        onPress={() => setAlertFilter(option.key)}
                        activeOpacity={0.85}
                        className={`rounded-full px-3 py-1 ${
                          isActive
                            ? 'bg-blue-600/15 dark:bg-blue-500/20'
                            : 'bg-slate-100/70 dark:bg-slate-800/80'
                        }`}>
                        <Text
                          className={`text-xs font-semibold uppercase tracking-wide ${
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
              </View>
              <TouchableOpacity
                onPress={handleHistoryPress}
                activeOpacity={0.7}
                className="self-start rounded-full px-3 py-2">
                <Text className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {t('dashboard.recentAlerts.viewAll')}
                </Text>
              </TouchableOpacity>
            </View>

            <View className="mt-4 space-y-3">
              {filteredDetectionEntries.length === 0 ? (
                <View className="items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                  <MaterialCommunityIcons name="check-circle" size={32} color="#22c55e" />
                  <Text className="mt-3 text-center text-sm text-slate-500 dark:text-slate-300">
                    {emptyAlertsMessage}
                  </Text>
                </View>
              ) : (
                filteredDetectionEntries.map((entry) => {
                  const {
                    badge,
                    text: severityText,
                    iconColor,
                  } = getSeverityColor(entry.result.score);
                  const primaryMatch = entry.result.matches[0];
                  const trustedSource = getTrustedSource(
                    entry.result.message.sender,
                    entry.result.message.channel
                  );

                  return (
                    <TouchableOpacity
                      key={entry.recordId}
                      onPress={() => setSelectedDetection(entry)}
                      activeOpacity={0.85}
                      className="flex-row gap-4 rounded-2xl border border-transparent bg-white p-4 shadow-sm dark:border-transparent dark:bg-slate-900">
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
                        {trustedSource ? (
                          <View className="mt-3 flex-row flex-wrap items-center gap-2">
                            <View className="flex-row items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 dark:bg-emerald-500/20">
                              <MaterialCommunityIcons
                                name="shield-check"
                                size={14}
                                color="#059669"
                              />
                              <Text className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                                {t('dashboard.recentAlerts.trustedBadge')}
                              </Text>
                            </View>
                            <Text className="text-xs text-emerald-700 dark:text-emerald-300">
                              {trustedSource.note ?? t('dashboard.recentAlerts.trustedDefault')}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>

          <View className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.trustedSources.title')}
                </Text>
                <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {t('dashboard.trustedSources.subtitle')}
                </Text>
              </View>
              <TouchableOpacity onPress={handleOpenSettings} activeOpacity={0.8}>
                <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                  {t('dashboard.trustedSources.cta')}
                </Text>
              </TouchableOpacity>
            </View>
            {trustedSources.length === 0 ? (
              <Text className="text-sm text-slate-500 dark:text-slate-400">
                {t('dashboard.trustedSources.empty')}
              </Text>
            ) : (
              <View className="space-y-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {t('dashboard.trustedSources.count', { count: trustedSources.length })}
                </Text>
                {topTrustedSources.map((source) => (
                  <View
                    key={source.id}
                    className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {source.displayName || source.handle}
                    </Text>
                    <View className="mt-2 flex-row flex-wrap items-center gap-2">
                      <View className="rounded-full bg-blue-50 px-3 py-1 dark:bg-blue-500/20">
                        <Text className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
                          {t(`dashboard.mockDetection.channels.${source.channel}`)}
                        </Text>
                      </View>
                      <Text className="text-xs text-slate-500 dark:text-slate-300">
                        {source.note ?? t('dashboard.trustedSources.noteFallback')}
                      </Text>
                    </View>
                  </View>
                ))}
                {trustedSources.length > topTrustedSources.length ? (
                  <Text className="text-xs text-slate-500 dark:text-slate-400">
                    {t('dashboard.trustedSources.more', {
                      remaining: trustedSources.length - topTrustedSources.length,
                    })}
                  </Text>
                ) : null}
              </View>
            )}
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

          <View
            onLayout={handleSectionLayout('mock')}
            className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <View>
              <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t('dashboard.mockDetection.title')}
              </Text>
              <Text className="text-sm text-slate-600 dark:text-slate-300">
                {t('dashboard.mockDetection.subtitle')}
              </Text>
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
        </View>
      </ScrollView>

      <AppModal
        isVisible={Boolean(statModalContent)}
        onClose={handleCloseStatModal}
        testID="stat-detail-modal">
        <View className="flex-1 justify-end">
          <View className="w-full rounded-t-3xl bg-white p-6 dark:bg-slate-900">
            {statModalContent ? (
              <View className="space-y-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {statModalContent.title}
                  </Text>
                  <TouchableOpacity onPress={handleCloseStatModal} activeOpacity={0.7}>
                    <MaterialCommunityIcons name="close" size={22} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <Text className="text-sm text-slate-600 dark:text-slate-300">
                  {statModalContent.body}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </AppModal>

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
