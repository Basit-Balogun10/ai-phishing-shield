import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'onboarding_completed_v1';
const THEME_PREFERENCE_KEY = 'theme_preference_v1';
const LANGUAGE_PREFERENCE_KEY = 'language_preference_v1';
const NOTIFICATION_PREFERENCES_KEY = 'notification_preferences_v1';
const TRUSTED_SOURCES_KEY = 'trusted_sources_v1';
const TELEMETRY_PREFERENCES_KEY = 'telemetry_preferences_v1';
const SHIELD_STATE_KEY = 'shield_state_v1';

export type ThemePreference = 'light' | 'dark' | 'system';

export type StoredTrustedSource = {
  id: string;
  displayName: string;
  handle: string;
  channel: 'sms' | 'email' | 'whatsapp';
  note?: string;
};

export type StoredNotificationPreferences = {
  alertsEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export type StoredTelemetryPreferences = {
  autoUploadEnabled: boolean;
  allowManualReports: boolean;
  lastUpdatedAt: string | null;
};

export type StoredShieldState = {
  paused: boolean;
  updatedAt: string | null;
};

const SUPPORTED_LOCALES = ['am', 'ar', 'en', 'fr', 'ha', 'ig', 'pcm', 'sw', 'yo'] as const;

export type StoredLocale = (typeof SUPPORTED_LOCALES)[number];

export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
}

export async function clearOnboardingComplete(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_KEY);
}

export async function isOnboardingComplete(): Promise<boolean> {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  return value === 'true';
}

export async function getThemePreference(): Promise<ThemePreference | null> {
  const value = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);

  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }

  return null;
}

export async function setThemePreference(value: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, value);
}

export async function clearThemePreference(): Promise<void> {
  await AsyncStorage.removeItem(THEME_PREFERENCE_KEY);
}

export async function getLanguagePreference(): Promise<StoredLocale | null> {
  const value = await AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY);

  if (value && SUPPORTED_LOCALES.includes(value as StoredLocale)) {
    return value as StoredLocale;
  }

  return null;
}

export async function setLanguagePreference(locale: StoredLocale): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, locale);
}

export async function clearLanguagePreference(): Promise<void> {
  await AsyncStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
}

export async function getNotificationPreferencesFromStorage(): Promise<StoredNotificationPreferences | null> {
  const raw = await AsyncStorage.getItem(NOTIFICATION_PREFERENCES_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.alertsEnabled === 'boolean' &&
      typeof parsed.soundEnabled === 'boolean' &&
      typeof parsed.vibrationEnabled === 'boolean' &&
      typeof parsed.quietHoursEnabled === 'boolean' &&
      typeof parsed.quietHoursStart === 'string' &&
      typeof parsed.quietHoursEnd === 'string'
    ) {
      return parsed as StoredNotificationPreferences;
    }
  } catch (error) {
    console.warn('[storage] Failed to parse notification preferences', error);
  }

  return null;
}

export async function setNotificationPreferencesInStorage(
  preferences: StoredNotificationPreferences
): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(preferences));
}

export async function getTrustedSourcesFromStorage(): Promise<StoredTrustedSource[]> {
  const raw = await AsyncStorage.getItem(TRUSTED_SOURCES_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => {
      return (
        item &&
        typeof item.id === 'string' &&
        typeof item.displayName === 'string' &&
        typeof item.handle === 'string' &&
        (item.channel === 'sms' || item.channel === 'email' || item.channel === 'whatsapp')
      );
    });
  } catch (error) {
    console.warn('[storage] Failed to parse trusted sources', error);
    return [];
  }
}

export async function setTrustedSourcesInStorage(sources: StoredTrustedSource[]): Promise<void> {
  await AsyncStorage.setItem(TRUSTED_SOURCES_KEY, JSON.stringify(sources));
}

export async function clearTrustedSourcesInStorage(): Promise<void> {
  await AsyncStorage.removeItem(TRUSTED_SOURCES_KEY);
}

export async function getTelemetryPreferencesFromStorage(): Promise<StoredTelemetryPreferences | null> {
  const raw = await AsyncStorage.getItem(TELEMETRY_PREFERENCES_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.autoUploadEnabled === 'boolean' &&
      typeof parsed.allowManualReports === 'boolean'
    ) {
      return {
        autoUploadEnabled: parsed.autoUploadEnabled,
        allowManualReports: parsed.allowManualReports,
        lastUpdatedAt: typeof parsed.lastUpdatedAt === 'string' ? parsed.lastUpdatedAt : null,
      } satisfies StoredTelemetryPreferences;
    }
  } catch (error) {
    console.warn('[storage] Failed to parse telemetry preferences', error);
  }

  return null;
}

export async function setTelemetryPreferencesInStorage(
  value: StoredTelemetryPreferences
): Promise<void> {
  await AsyncStorage.setItem(TELEMETRY_PREFERENCES_KEY, JSON.stringify(value));
}

export async function clearTelemetryPreferencesInStorage(): Promise<void> {
  await AsyncStorage.removeItem(TELEMETRY_PREFERENCES_KEY);
}

export async function getShieldStateFromStorage(): Promise<StoredShieldState | null> {
  const raw = await AsyncStorage.getItem(SHIELD_STATE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (typeof parsed === 'object' && parsed !== null) {
      return {
        paused: Boolean(parsed.paused),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      } satisfies StoredShieldState;
    }
  } catch (error) {
    console.warn('[storage] Failed to parse shield state', error);
  }

  return null;
}

export async function setShieldStateInStorage(value: StoredShieldState): Promise<void> {
  await AsyncStorage.setItem(SHIELD_STATE_KEY, JSON.stringify(value));
}

export async function clearShieldStateInStorage(): Promise<void> {
  await AsyncStorage.removeItem(SHIELD_STATE_KEY);
}
