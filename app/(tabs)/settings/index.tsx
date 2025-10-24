import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useOnboardingGate } from '../../../lib/hooks/useOnboardingGate';
import { useThemePreference } from '../../../lib/hooks/useThemePreference';
import { useLanguagePreference } from '../../../lib/hooks/useLanguagePreference';
import type { ThemePreference } from '../../../lib/storage';
import { useTrustedSources } from '../../../lib/trustedSources';
import { useNotificationPreferences } from '../../../lib/notificationPreferences';
import { useModelManager } from '../../../lib/modelManager';
import { trackTelemetryEvent } from '../../../lib/services/telemetry';

const CARD_CLASS =
  'rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900';

export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { allowed, checking } = useOnboardingGate();

  const {
    preference,
    resolvedColorScheme,
    ready: themeReady,
    setPreference,
  } = useThemePreference();
  const {
    ready: languageReady,
    locale: activeLocale,
    usingDeviceDefault,
  } = useLanguagePreference();
  const { ready: trustedReady, sources: trustedSources } = useTrustedSources();
  const { ready: notificationsReady, preferences: notificationPreferences } =
    useNotificationPreferences();
  const {
    ready: modelReady,
    current: activeModel,
    status: modelStatus,
    activeOperation: modelOperation,
  } = useModelManager();

  const modelStatusLabel = useMemo(() => {
    if (modelStatus === 'syncing') {
      return t('dashboard.hero.modelStatus.syncing');
    }

    if (!modelOperation) {
      return null;
    }

    const { type, version } = modelOperation;

    if (type === 'download') {
      return t('dashboard.hero.modelStatus.downloading', { version });
    }

    if (type === 'activate') {
      return t('dashboard.hero.modelStatus.activating', { version });
    }

    if (type === 'remove') {
      return t('dashboard.hero.modelStatus.removing', { version });
    }

    if (type === 'sync') {
      return t('dashboard.hero.modelStatus.syncing');
    }

    return null;
  }, [modelOperation, modelStatus, t]);

  const handleThemeChange = (value: ThemePreference) => async () => {
    if (preference === value) {
      return;
    }

    trackTelemetryEvent('settings.theme_changed', { preference: value });
    try {
      await setPreference(value);
    } catch (error) {
      console.warn('[settings] Failed to update theme preference', error);
    }
  };

  const handleOpenModelManager = () => {
    trackTelemetryEvent('settings.model_entry_opened', { source: 'settings_root' });
    router.push('/(tabs)/settings/model');
  };

  const notificationBadge = notificationPreferences.alertsEnabled
    ? t('settings.entries.notifications.badge.on')
    : t('settings.entries.notifications.badge.off');

  if (
    checking ||
    !themeReady ||
    !trustedReady ||
    !languageReady ||
    !notificationsReady ||
    !modelReady
  ) {
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
      <View className="border-b border-slate-200/70 bg-slate-50 px-6 pb-6 pt-6 dark:border-slate-800 dark:bg-slate-950">
        <View className="relative flex-row items-center justify-center">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('settings.back')}
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="absolute left-0 rounded-full bg-slate-200 p-2 dark:bg-slate-800">
            <MaterialCommunityIcons
              name="chevron-left"
              size={28}
              color={resolvedColorScheme === 'light' ? '#0f172a' : '#e2e8f0'}
            />
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.title')}
          </Text>
        </View>
        <Text className="mt-4 text-base text-slate-600 dark:text-slate-400">
          {t('settings.subtitle')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        contentInsetAdjustmentBehavior="automatic">
        <View className="px-6 pb-8" style={{ rowGap: 20 }}>
          <View className={CARD_CLASS}>
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
                  <TouchableOpacity
                    key={value}
                    onPress={handleThemeChange(value)}
                    activeOpacity={0.85}
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
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/settings/language')}
            className={CARD_CLASS}>
            <Text className="text-lg font-medium text-slate-900 dark:text-slate-100">
              {t('settings.entries.language.title')}
            </Text>
            <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              {t('settings.entries.language.description')}
            </Text>
            <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              {usingDeviceDefault
                ? t('settings.entries.language.deviceDefault.badge')
                : t(`settings.entries.language.options.${activeLocale}.title`)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/settings/notifications')}
            className={CARD_CLASS}>
            <Text className="text-lg font-medium text-slate-900 dark:text-slate-100">
              {t('settings.entries.notifications.title')}
            </Text>
            <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              {t('settings.entries.notifications.description')}
            </Text>
            <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              {notificationBadge}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/settings/trusted')}
            className={CARD_CLASS}>
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 pr-4">
                <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t('settings.entries.trustedSources.title')}
                </Text>
                <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {t('settings.entries.trustedSources.description')}
                </Text>
              </View>
              <MaterialCommunityIcons name="shield-account" size={26} color="#2563eb" />
            </View>
            <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              {trustedSources.length
                ? t('dashboard.trustedSources.count', {
                    count: trustedSources.length,
                  })
                : t('settings.entries.trustedSources.addButton')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOpenModelManager}
            activeOpacity={0.85}
            className={CARD_CLASS}
            accessibilityRole="button">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t('settings.entries.model.title')}
                </Text>
                <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {t('settings.entries.model.description')}
                </Text>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {modelReady ? (
                    <Text className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
                      {t('settings.entries.model.currentBadge', {
                        version: activeModel?.version ?? '—',
                      })}
                    </Text>
                  ) : (
                    <Text className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
                      {t('common.loading')}
                    </Text>
                  )}
                  {modelStatusLabel ? (
                    <Text className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                      {modelStatusLabel}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View className="rounded-full bg-blue-600 px-4 py-2 dark:bg-blue-500">
                <Text className="text-xs font-semibold uppercase tracking-wide text-white">
                  {t('settings.entries.model.manageButton')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
