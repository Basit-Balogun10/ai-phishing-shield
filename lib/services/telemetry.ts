import { Platform } from 'react-native';

import type { ThemePreference } from '../storage';
import type { TrustedSource } from '../trustedSources';

type PermissionKind = 'notifications';

type PermissionStatusOutcome = 'granted' | 'denied' | 'blocked' | 'unavailable';

type NotificationPreferenceField =
  | 'alertsEnabled'
  | 'soundEnabled'
  | 'vibrationEnabled'
  ;

type ManualReportSource = 'quick_action' | 'alert_detail' | 'settings';

type ManualReportChannel = 'sms' | 'whatsapp' | 'email';

type ManualReportCategory = 'phishing' | 'suspicious' | 'false_positive' | 'other';

export type TelemetryPayloads = {
  'onboarding.screen_opened': {
    locale: string;
    platform: typeof Platform.OS;
  };
  'onboarding.slide_viewed': {
    index: number;
    total: number;
  };
  'onboarding.permission_step_viewed': {
    notificationsGranted: boolean;
  };
  'onboarding.permission_request_started': {
    permission: PermissionKind;
  };
  'onboarding.permission_request_completed': {
    permission: PermissionKind;
    outcome: PermissionStatusOutcome;
    canAskAgain: boolean;
  };
  'onboarding.skip_pressed': undefined;
  'onboarding.completed': {
    notificationsGranted: boolean;
  };
  'onboarding.system_settings_opened': {
    permission: PermissionKind;
  };
  'alerts.search_changed': {
    queryLength: number;
    filters: {
      source: 'all' | 'historical' | 'simulated' | 'trusted';
      severity: 'all' | 'high' | 'medium' | 'low';
      channel: 'all' | 'sms' | 'whatsapp' | 'email';
      trustedOnly: boolean;
    };
  };
  'alerts.filter_changed': {
    source: 'all' | 'historical' | 'simulated' | 'trusted';
    severity: 'all' | 'high' | 'medium' | 'low';
    channel: 'all' | 'sms' | 'whatsapp' | 'email';
    trustedOnly: boolean;
  };
  'alerts.feedback_submitted': {
    recordId: string;
    status: 'confirmed' | 'false_positive';
    channel: 'sms' | 'whatsapp' | 'email';
    score: number;
    source: 'historical' | 'simulated';
  };
  'settings.theme_changed': {
    preference: ThemePreference;
  };
  'settings.trusted_source_saved': {
    channel: TrustedSource['channel'];
    hasNote: boolean;
  };
  'settings.trusted_source_removed': {
    channel: TrustedSource['channel'];
    hadNote: boolean;
  };
  'settings.language_selected': {
    locale: string;
    usingDeviceDefault: boolean;
  };
  'settings.notifications_updated': {
    field: NotificationPreferenceField;
    value: boolean | string;
  };
  'settings.notifications_permission_requested': {
    granted: boolean;
    blocked: boolean;
    canAskAgain: boolean;
  };
  'settings.notifications_open_settings': undefined;
  'settings.telemetry_preference_updated': {
    field: 'autoUploadEnabled' | 'allowManualReports';
    value: boolean;
  };
  'settings.telemetry_preferences_reset': undefined;
  'settings.model.manage_opened': {
    source: 'dashboard_quick_action' | 'settings_quick_action' | 'link';
  };
  'settings.model_entry_opened': {
    source: 'settings_tab' | 'settings_root';
  };
  'dashboard.mock_detection_triggered': {
    source: 'quick_action' | 'background';
    triggered: boolean;
  };
  'dashboard.shield_toggled': {
    paused: boolean;
  };
  'dashboard.manual_report_opened': {
    source: ManualReportSource;
  };
  'dashboard.safe_sample_previewed': undefined;
  'dashboard.detection_cleared': {
    recordId: string;
  };
  'dashboard.quick_action.alerts_opened': undefined;
  'dashboard.quick_action.stats_opened': undefined;
  'dashboard.quick_action.trusted_sources_opened': undefined;
  // Backwards-compatible permission request events used in the dashboard
  'permissions.request_granted': undefined;
  'permissions.request_denied': undefined;
  'stats.timeframe_changed': {
    timeframe: '24h' | '7d' | '30d' | 'all';
  };
  'reports.submitted': {
    category: ManualReportCategory;
    channel: ManualReportChannel;
    hasComment: boolean;
  };
  'background.detection_registration': {
    status: 'registered' | 'skipped';
    reason?: string;
  };
  'model_manager.screen_viewed': {
    installedCount: number;
    availableCount: number;
  };
  'model_manager.sync_requested': undefined;
  'model_manager.sync_completed': undefined;
  'model_manager.sync_failed': undefined;
  'model_manager.install_requested': {
    version: string;
  };
  'model_manager.install_completed': {
    version: string;
  };
  'model_manager.install_failed': {
    version: string;
  };
  'model_manager.activate_requested': {
    version: string;
  };
  'model_manager.activate_completed': {
    version: string;
  };
  'model_manager.activate_failed': {
    version: string;
  };
  'model_manager.remove_requested': {
    version: string;
  };
  'model_manager.remove_completed': {
    version: string;
  };
  'model_manager.remove_failed': {
    version: string;
  };
};

export type EventName = keyof TelemetryPayloads;

export type TelemetryAdapter = <E extends EventName>(
  event: E,
  payload: TelemetryPayloads[E]
) => void | Promise<void>;

let currentAdapter: TelemetryAdapter = (event, payload) => {
  if (__DEV__) {
    const output = payload ? JSON.stringify(payload) : '{}';
    console.info(`[telemetry] ${event} ${output}`);
  }
};

export const setTelemetryAdapter = (adapter: TelemetryAdapter) => {
  currentAdapter = adapter;
};

export const resetTelemetryAdapter = () => {
  currentAdapter = (event, payload) => {
    if (__DEV__) {
      const output = payload ? JSON.stringify(payload) : '{}';
      console.info(`[telemetry] ${event} ${output}`);
    }
  };
};

export const trackTelemetryEvent = <E extends EventName>(
  event: E,
  payload: TelemetryPayloads[E]
): void => {
  try {
    const maybePromise = currentAdapter(event, payload);

    if (maybePromise && typeof maybePromise === 'object' && 'then' in maybePromise) {
      (maybePromise as Promise<void>).catch((error) => {
        if (__DEV__) {
          console.warn('[telemetry] Adapter promise rejected', event, error);
        }
      });
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[telemetry] Failed to dispatch event', event, error);
    }
  }
};

export const derivePermissionOutcome = (options: {
  granted: boolean;
  blocked: boolean;
  canAskAgain: boolean;
  unavailable?: boolean;
}): PermissionStatusOutcome => {
  if (options.unavailable) {
    return 'unavailable';
  }

  if (options.granted) {
    return 'granted';
  }

  if (options.blocked || !options.canAskAgain) {
    return 'blocked';
  }

  return 'denied';
};
