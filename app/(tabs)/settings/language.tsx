import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useLanguagePreference } from '../../../lib/hooks/useLanguagePreference';
import { useThemePreference } from '../../../lib/hooks/useThemePreference';
import type { SupportedLocale } from '../../../lib/i18n';
import { trackTelemetryEvent } from '../../../lib/services/telemetry';

export default function LanguageSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { ready, availableLocales, locale, setLocale, resetToSystem, usingDeviceDefault } =
    useLanguagePreference();
  const { resolvedColorScheme } = useThemePreference();

  const handleBack = useCallback(() => {
    router.replace('/settings');
  }, [router]);

  const handleSelect = useCallback(
    (code: SupportedLocale) => async () => {
      await setLocale(code);
      trackTelemetryEvent('settings.language_selected', {
        locale: code,
        usingDeviceDefault: false,
      });
    },
    [setLocale]
  );

  const handleReset = useCallback(async () => {
    await resetToSystem();
    trackTelemetryEvent('settings.language_selected', {
      locale: locale ?? 'system',
      usingDeviceDefault: true,
    });
  }, [locale, resetToSystem]);

  if (!ready) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {t('settings.language.loading')}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="border-b border-slate-200/70 bg-slate-50 px-6 pb-6 pt-6 dark:border-slate-800 dark:bg-slate-950">
        <View className="relative flex-row items-center justify-center">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('settings.back')}
            onPress={handleBack}
            activeOpacity={0.7}
            className="absolute left-0 rounded-full bg-slate-200 p-2 dark:bg-slate-800">
            <MaterialCommunityIcons
              name="chevron-left"
              size={28}
              color={resolvedColorScheme === 'light' ? '#0f172a' : '#e2e8f0'}
            />
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.entries.language.title')}
          </Text>
        </View>
        <Text className="mt-4 text-base text-slate-600 dark:text-slate-400">
          {t('settings.entries.language.description')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        contentInsetAdjustmentBehavior="automatic">
        <View className="px-6 pb-8" style={{ rowGap: 16 }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: usingDeviceDefault }}
            onPress={handleReset}
            activeOpacity={0.85}
            className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t('settings.entries.language.deviceDefault.title')}
                </Text>
                <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {t('settings.entries.language.deviceDefault.description')}
                </Text>
              </View>
              {usingDeviceDefault ? (
                <MaterialCommunityIcons name="check-circle" size={24} color="#2563eb" />
              ) : null}
            </View>
            {usingDeviceDefault ? (
              <Text className="mt-3 text-xs font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
                {t('settings.entries.language.activeBadge')}
              </Text>
            ) : null}
          </TouchableOpacity>

          <View style={{ rowGap: 12 }}>
            {availableLocales.map((code) => {
              const isActive = locale === code && !usingDeviceDefault;
              return (
                <TouchableOpacity
                  key={code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onPress={handleSelect(code)}
                  activeOpacity={0.85}
                  className={`rounded-xl border px-4 py-4 ${
                    isActive
                      ? 'border-blue-600 bg-blue-50 dark:border-blue-400/80 dark:bg-blue-500/10'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                  }`}>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-4">
                      <Text
                        className={`text-base font-semibold ${
                          isActive
                            ? 'text-blue-700 dark:text-blue-200'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}>
                        {t(`settings.entries.language.options.${code}.title`)}
                      </Text>
                      <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                        {t(`settings.entries.language.options.${code}.native`)}
                      </Text>
                    </View>
                    {isActive ? (
                      <MaterialCommunityIcons name="check-circle" size={24} color="#2563eb" />
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
