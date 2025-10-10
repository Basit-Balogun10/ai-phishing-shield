import { Platform } from 'react-native';
import Constants from 'expo-constants';

import {
  checkNotificationPermission,
  checkSmsPermission,
  type PermissionStatus,
} from '../permissions';
import {
  getLanguagePreference,
  getThemePreference,
  type ThemePreference,
  type StoredLocale,
} from '../storage';
import {
  notificationPreferencesStore,
  type NotificationPreferences,
} from '../notificationPreferences';
import { isQuietHoursActive } from '../notifications';
import { resolveTrustedSources } from '../trustedSources';
import {
  detectionHistoryStore,
  getSimulatedDetections,
  getLatestSimulatedDetection,
} from '../detection/detectionHistory';
import i18n, { resolveInitialLocale } from '../i18n';
import { getTelemetryBufferSnapshot, type TelemetryEventEnvelope } from './telemetryAdapter';

export type DiagnosticsSnapshot = {
  generatedAt: string;
  environment: {
    platform: typeof Platform.OS;
    appOwnership: string | null;
    appVersion: string | null;
    buildNumber: string | null;
  };
  localization: {
    activeLocale: string;
    deviceLocale: string;
    storedLocale: StoredLocale | null;
  };
  theme: {
    storedPreference: ThemePreference | null;
  };
  notifications: {
    permission: PermissionStatus;
    preferences: NotificationPreferences;
    quietHoursActive: boolean;
  };
  sms: {
    permission: PermissionStatus;
  };
  detections: {
    historicalCount: number;
    simulatedCount: number;
    lastSimulatedAt: string | null;
  };
  trustedSources: {
    total: number;
  };
  telemetry: {
    totalEvents: number;
    latestEventAt: string | null;
    buffer: TelemetryEventEnvelope[];
  };
};

const resolveEnvironment = () => {
  const expoConfig = Constants.expoConfig ?? null;

  return {
    platform: Platform.OS,
    appOwnership: Constants.appOwnership ?? null,
    appVersion: expoConfig?.version ?? null,
    buildNumber:
      expoConfig?.android?.versionCode?.toString() ?? expoConfig?.ios?.buildNumber ?? null,
  };
};

export const buildDiagnosticsSnapshot = async (): Promise<DiagnosticsSnapshot> => {
  await notificationPreferencesStore.initialize();
  const { preferences } = notificationPreferencesStore.getSnapshot();

  const [
    storedLocale,
    themePreference,
    notificationPermission,
    smsPermission,
    trustedSources,
    telemetrySnapshot,
  ] = await Promise.all([
    getLanguagePreference(),
    getThemePreference(),
    checkNotificationPermission(),
    checkSmsPermission(),
    resolveTrustedSources(),
    getTelemetryBufferSnapshot(),
  ]);

  const simulatedDetections = getSimulatedDetections();
  const detectionSnapshot = detectionHistoryStore.getSnapshot();
  const lastSimulated = getLatestSimulatedDetection();

  return {
    generatedAt: new Date().toISOString(),
    environment: resolveEnvironment(),
    localization: {
      activeLocale: i18n.language,
      deviceLocale: resolveInitialLocale(),
      storedLocale,
    },
    theme: {
      storedPreference: themePreference,
    },
    notifications: {
      permission: notificationPermission,
      preferences,
      quietHoursActive: isQuietHoursActive(preferences),
    },
    sms: {
      permission: smsPermission,
    },
    detections: {
      historicalCount: detectionSnapshot.historical.length,
      simulatedCount: simulatedDetections.length,
      lastSimulatedAt: lastSimulated?.detectedAt ?? null,
    },
    trustedSources: {
      total: trustedSources.length,
    },
    telemetry: {
      totalEvents: telemetrySnapshot.totalEvents,
      latestEventAt: telemetrySnapshot.latestEventAt,
      buffer: telemetrySnapshot.events,
    },
  } satisfies DiagnosticsSnapshot;
};

export const formatDiagnosticsSnapshot = (snapshot: DiagnosticsSnapshot): string => {
  return JSON.stringify(snapshot, null, 2);
};
