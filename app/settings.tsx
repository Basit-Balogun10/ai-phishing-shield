import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useOnboardingGate } from '../lib/hooks/useOnboardingGate';
import { useThemePreference } from '../lib/hooks/useThemePreference';
import type { ThemePreference } from '../lib/storage';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { checking, allowed } = useOnboardingGate();
  const { preference, setPreference, ready } = useThemePreference();

  const handleThemeChange = (value: ThemePreference) => async () => {
    await setPreference(value);
  };

  if (checking || !ready) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          {t('common.loading')}
        </Text>
      </SafeAreaView>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="space-y-6 px-6 py-8">
        <View className="space-y-2">
          <Text className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.title')}
          </Text>
          <Text className="text-base text-slate-600 dark:text-slate-400">
            {t('settings.subtitle')}
          </Text>
        </View>

        <View className="space-y-4">
          <View className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
            <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('settings.entries.theme.title')}
            </Text>
            <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              {t('settings.entries.theme.description')}
            </Text>
            <View className="mt-4 flex-row gap-2">
              {(['dark', 'light', 'system'] as ThemePreference[]).map((value) => {
                const isActive = preference === value;
                return (
                  <Pressable
                    key={value}
                    onPress={handleThemeChange(value)}
                    className={`flex-1 rounded-full px-4 py-2 ${
                      isActive
                        ? 'bg-blue-600'
                        : 'border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
                    }`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}>
                    <Text
                      className={`text-center text-sm font-semibold ${
                        isActive ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                      }`}>
                      {t(`settings.entries.theme.options.${value}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <Text className="text-lg font-medium text-slate-900 dark:text-slate-100">
              {t('settings.entries.language.title')}
            </Text>
            <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              {t('settings.entries.language.description')}
            </Text>
          </Pressable>

          <Pressable className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <Text className="text-lg font-medium text-slate-900 dark:text-slate-100">
              {t('settings.entries.notifications.title')}
            </Text>
            <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              {t('settings.entries.notifications.description')}
            </Text>
          </Pressable>

          <Pressable className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <Text className="text-lg font-medium text-slate-900 dark:text-slate-100">
              {t('settings.entries.diagnostics.title')}
            </Text>
            <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              {t('settings.entries.diagnostics.description')}
            </Text>
          </Pressable>
        </View>

        <View className="pt-4">
          <Link href="/" className="text-base font-semibold text-blue-600 dark:text-blue-400">
            {t('settings.back')}
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}
