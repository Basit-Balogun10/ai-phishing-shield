import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'onboarding_completed_v1';
const THEME_PREFERENCE_KEY = 'theme_preference_v1';

export type ThemePreference = 'light' | 'dark' | 'system';

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
