import { Platform } from 'react-native';

type PermissionKind = 'notifications' | 'sms';

type PermissionStatusOutcome = 'granted' | 'denied' | 'blocked' | 'unavailable';

type TelemetryPayloads = {
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
    smsGranted: boolean;
    smsRequired: boolean;
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
    smsGranted: boolean;
    smsRequired: boolean;
  };
  'onboarding.system_settings_opened': {
    permission: PermissionKind;
  };
};

type EventName = keyof TelemetryPayloads;

type TelemetryAdapter = <E extends EventName>(event: E, payload: TelemetryPayloads[E]) => void;

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
    currentAdapter(event, payload);
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
