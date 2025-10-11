import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useOnboardingGate } from '../lib/hooks/useOnboardingGate';
import { useThemePreference } from '../lib/hooks/useThemePreference';
import { useLanguagePreference } from '../lib/hooks/useLanguagePreference';
import type { ThemePreference } from '../lib/storage';
import { AppModal } from '../components/AppModal';
import {
  isTrustedSender,
  trustedSourcesStore,
  useTrustedSources,
  type TrustedSource,
} from '../lib/trustedSources';
import { useNotificationPreferences } from '../lib/notificationPreferences';
import { trackTelemetryEvent } from '../lib/services/telemetry';
import { useModelManager } from '../lib/modelManager';
import { telemetryPreferencesStore, useTelemetryPreferences } from '../lib/telemetryPreferences';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { checking, allowed } = useOnboardingGate();
  const {
    preference,
    resolvedColorScheme,
    setPreference,
    ready: themeReady,
  } = useThemePreference();
  const {
    ready: languageReady,
    locale: activeLocale,
    usingDeviceDefault,
  } = useLanguagePreference();
  const { ready: notificationsReady, preferences: notificationPreferences } =
    useNotificationPreferences();
  const { ready: trustedReady, sources: trustedSources } = useTrustedSources();
  const { ready: telemetryReady, preferences: telemetryPreferences } = useTelemetryPreferences();
  const {
    ready: modelReady,
    current: activeModel,
    status: modelStatus,
    activeOperation: modelOperation,
  } = useModelManager();
  const router = useRouter();
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState({
    displayName: '',
    handle: '',
    channel: 'sms' as TrustedSource['channel'],
    note: '',
  });

  const handleThemeChange = (value: ThemePreference) => async () => {
    await setPreference(value);
    trackTelemetryEvent('settings.theme_changed', { preference: value });
  };

  const resetForm = () => {
    setFormState({ displayName: '', handle: '', channel: 'sms', note: '' });
  };

  const handleOpenAddModal = () => {
    resetForm();
    setIsAddModalVisible(true);
  };

  const handleCloseModal = () => {
    if (!isSubmitting) {
      setIsAddModalVisible(false);
    }
  };

  const handleRemoveSource = (source: TrustedSource) => {
    Alert.alert(t('settings.entries.trustedSources.removeTitle'), source.displayName, [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('settings.entries.trustedSources.removeConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await trustedSourcesStore.removeSource(source.id);
            trackTelemetryEvent('settings.trusted_source_removed', {
              channel: source.channel,
              hadNote: Boolean(source.note?.trim()),
            });
          } catch (error) {
            console.warn('[settings] Failed to remove trusted source', error);
            Alert.alert(
              t('settings.entries.trustedSources.errorTitle'),
              t('settings.entries.trustedSources.errorBody')
            );
          }
        },
      },
    ]);
  };

  const handleSubmitTrustedSource = async () => {
    const trimmedHandle = formState.handle.trim();

    if (!trimmedHandle) {
      Alert.alert(
        t('settings.entries.trustedSources.validationTitle'),
        t('settings.entries.trustedSources.validationHandle')
      );
      return;
    }

    if (isTrustedSender(trimmedHandle, formState.channel)) {
      Alert.alert(
        t('settings.entries.trustedSources.duplicateTitle'),
        t('settings.entries.trustedSources.duplicateBody')
      );
      return;
    }

    setIsSubmitting(true);

    try {
      await trustedSourcesStore.addSource({
        displayName: formState.displayName,
        handle: trimmedHandle,
        channel: formState.channel,
        note: formState.note,
      });
      setIsAddModalVisible(false);
      resetForm();
      Alert.alert(t('settings.entries.trustedSources.successTitle'));
      trackTelemetryEvent('settings.trusted_source_saved', {
        channel: formState.channel,
        hasNote: Boolean(formState.note.trim()),
      });
    } catch (error) {
      console.warn('[settings] Failed to add trusted source', error);
      Alert.alert(
        t('settings.entries.trustedSources.errorTitle'),
        t('settings.entries.trustedSources.errorBody')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTelemetryChange =
    (field: 'autoUploadEnabled' | 'allowManualReports') => async (value: boolean) => {
      try {
        await telemetryPreferencesStore.updatePreferences({
          [field]: value,
        });
        trackTelemetryEvent('settings.telemetry_preference_updated', { field, value });
      } catch (error) {
        console.warn('[settings] Failed to update telemetry preference', error);
        Alert.alert(
          t('settings.entries.telemetry.errorTitle'),
          t('settings.entries.telemetry.errorBody')
        );
      }
    };

  const channelOptions = useMemo(
    () => [
      { key: 'sms' as const, label: t('dashboard.mockDetection.channels.sms') },
      { key: 'whatsapp' as const, label: t('dashboard.mockDetection.channels.whatsapp') },
      { key: 'email' as const, label: t('dashboard.mockDetection.channels.email') },
    ],
    [t]
  );

  const activeModelVersion = activeModel?.version ?? 'v0.1.0';

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

  const handleOpenModelManager = () => {
    trackTelemetryEvent('settings.model_entry_opened', { source: 'settings_root' });
    router.push('/settings/model');
  };

  if (
    checking ||
    !themeReady ||
    !trustedReady ||
    !languageReady ||
    !notificationsReady ||
    !telemetryReady
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

  const notificationBadge = notificationPreferences.alertsEnabled
    ? notificationPreferences.quietHoursEnabled
      ? t('settings.entries.notifications.badge.quietHours', {
          start: notificationPreferences.quietHoursStart,
          end: notificationPreferences.quietHoursEnd,
        })
      : t('settings.entries.notifications.badge.on')
    : t('settings.entries.notifications.badge.off');

  if (!allowed) {
    return null;
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-6 pb-8 pt-6">
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

      <View className="space-y-4 px-6 pb-8">
        <View className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t('settings.entries.trustedSources.title')}
              </Text>
              <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                {t('settings.entries.trustedSources.description')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleOpenAddModal}
              activeOpacity={0.85}
              className="rounded-full bg-blue-600 px-4 py-2 dark:bg-blue-500">
              <Text className="text-xs font-semibold uppercase tracking-wide text-white">
                {t('settings.entries.trustedSources.addButton')}
              </Text>
            </TouchableOpacity>
          </View>

          {trustedSources.length === 0 ? (
            <View className="mt-4 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
              <MaterialCommunityIcons name="shield-check" size={32} color="#22c55e" />
              <Text className="mt-2 text-center text-sm text-slate-500 dark:text-slate-300">
                {t('settings.entries.trustedSources.emptyState')}
              </Text>
            </View>
          ) : (
            <View className="mt-4 space-y-3">
              {trustedSources.map((source) => (
                <View
                  key={source.id}
                  className="rounded-xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/80">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {source.displayName}
                      </Text>
                      <View className="mt-2 flex-row flex-wrap items-center gap-2">
                        <Text className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
                          {t(`dashboard.mockDetection.channels.${source.channel}`)}
                        </Text>
                        <Text className="text-xs font-medium text-slate-500 dark:text-slate-300">
                          {source.handle}
                        </Text>
                        {source.note ? (
                          <Text className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
                            {source.note}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemoveSource(source)}
                      accessibilityRole="button"
                      accessibilityLabel={t('settings.entries.trustedSources.removeA11y', {
                        name: source.displayName,
                      })}
                      activeOpacity={0.7}
                      className="h-9 w-9 items-center justify-center rounded-full bg-rose-500/10">
                      <MaterialCommunityIcons name="trash-can" size={18} color="#f43f5e" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

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

        <View className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
          <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.entries.telemetry.title')}
          </Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
            {t('settings.entries.telemetry.description')}
          </Text>

          <View className="mt-4 space-y-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-6">
                <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('settings.entries.telemetry.autoUploadTitle')}
                </Text>
                <Text className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  {t('settings.entries.telemetry.autoUploadSubtitle')}
                </Text>
              </View>
              <Switch
                value={telemetryPreferences.autoUploadEnabled}
                onValueChange={handleTelemetryChange('autoUploadEnabled')}
              />
            </View>

            <View className="h-px bg-slate-200 dark:bg-slate-800" />

            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-6">
                <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('settings.entries.telemetry.manualReportsTitle')}
                </Text>
                <Text className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  {t('settings.entries.telemetry.manualReportsSubtitle')}
                </Text>
              </View>
              <Switch
                value={telemetryPreferences.allowManualReports}
                onValueChange={handleTelemetryChange('allowManualReports')}
              />
            </View>
          </View>
        </View>

        <View className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
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
                    {t('settings.entries.model.currentBadge', { version: activeModelVersion })}
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
            <TouchableOpacity
              onPress={handleOpenModelManager}
              activeOpacity={0.85}
              className="rounded-full bg-blue-600 px-4 py-2 dark:bg-blue-500">
              <Text className="text-xs font-semibold uppercase tracking-wide text-white">
                {t('settings.entries.model.manageButton')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/settings/language')}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
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
          onPress={() => router.push('/settings/notifications')}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
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
          onPress={() => router.push('/settings/diagnostics')}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <Text className="text-lg font-medium text-slate-900 dark:text-slate-100">
            {t('settings.entries.diagnostics.title')}
          </Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
            {t('settings.entries.diagnostics.description')}
          </Text>
        </TouchableOpacity>
      </View>

      <AppModal
        isVisible={isAddModalVisible}
        onClose={handleCloseModal}
        testID="trusted-sources-modal">
        <View className="flex-1 justify-end">
          <View className="w-full rounded-t-3xl bg-white p-6 dark:bg-slate-900">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t('settings.entries.trustedSources.modalTitle')}
                </Text>
                <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {t('settings.entries.trustedSources.modalSubtitle')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCloseModal}
                activeOpacity={0.7}
                className="rounded-full bg-slate-100 p-2 dark:bg-slate-800">
                <MaterialCommunityIcons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View className="mt-6 space-y-4">
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('settings.entries.trustedSources.fields.channel')}
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {channelOptions.map((option) => {
                    const isActive = formState.channel === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        onPress={() => setFormState((prev) => ({ ...prev, channel: option.key }))}
                        activeOpacity={0.85}
                        className={`rounded-full px-3 py-1 ${
                          isActive
                            ? 'bg-blue-600 dark:bg-blue-500'
                            : 'bg-slate-100 dark:bg-slate-800'
                        }`}>
                        <Text
                          className={`text-xs font-semibold uppercase tracking-wide ${
                            isActive ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                          }`}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('settings.entries.trustedSources.fields.handle')}
                </Text>
                <TextInput
                  value={formState.handle}
                  onChangeText={(text) => setFormState((prev) => ({ ...prev, handle: text }))}
                  placeholder={t('settings.entries.trustedSources.placeholders.handle')}
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="words"
                  autoCorrect={false}
                  className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('settings.entries.trustedSources.fields.displayName')}
                </Text>
                <TextInput
                  value={formState.displayName}
                  onChangeText={(text) => setFormState((prev) => ({ ...prev, displayName: text }))}
                  placeholder={t('settings.entries.trustedSources.placeholders.displayName')}
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="words"
                  className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('settings.entries.trustedSources.fields.note')}
                </Text>
                <TextInput
                  value={formState.note}
                  onChangeText={(text) => setFormState((prev) => ({ ...prev, note: text }))}
                  placeholder={t('settings.entries.trustedSources.placeholders.note')}
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="sentences"
                  className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </View>
            </View>

            <View className="mt-6 flex-row gap-3">
              <TouchableOpacity
                onPress={handleCloseModal}
                disabled={isSubmitting}
                activeOpacity={0.85}
                className="flex-1 rounded-full border border-slate-300 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900">
                <Text className="text-center text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmitTrustedSource}
                disabled={isSubmitting}
                activeOpacity={0.85}
                className={`flex-1 rounded-full px-5 py-3 ${
                  isSubmitting
                    ? 'bg-slate-400/70 dark:bg-slate-700'
                    : 'bg-blue-600 dark:bg-blue-500'
                }`}>
                <Text className="text-center text-sm font-semibold text-white">
                  {isSubmitting ? t('settings.entries.trustedSources.saving') : t('common.save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </AppModal>
    </SafeAreaView>
  );
}
