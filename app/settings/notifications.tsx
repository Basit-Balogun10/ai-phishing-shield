import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useThemePreference } from '../../lib/hooks/useThemePreference';
import {
  useNotificationPreferences,
  notificationPreferencesStore,
} from '../../lib/notificationPreferences';
import {
  checkNotificationPermission,
  requestNotificationPermission,
  openSystemSettings,
  type PermissionStatus,
} from '../../lib/permissions';
import { trackTelemetryEvent } from '../../lib/services/telemetry';

const formatRange = (start: string, end: string) => {
  const toLabel = (value: string) => {
    const [hours, minutes] = value.split(':');
    const date = new Date();
    date.setHours(Number.parseInt(hours ?? '0', 10));
    date.setMinutes(Number.parseInt(minutes ?? '0', 10));
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return `${toLabel(start)} – ${toLabel(end)}`;
};

const QUIET_HOUR_PRESETS = [
  { key: '21-07', start: '21:00', end: '07:00' },
  { key: '22-06', start: '22:00', end: '06:00' },
  { key: '23-05', start: '23:00', end: '05:00' },
];

export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { resolvedColorScheme } = useThemePreference();
  const {
    ready,
    preferences: {
      alertsEnabled,
      soundEnabled,
      vibrationEnabled,
      quietHoursEnabled,
      quietHoursStart,
      quietHoursEnd,
    },
  } = useNotificationPreferences();
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    checkNotificationPermission()
      .then(setPermissionStatus)
      .catch((error) => {
        console.warn('[settings] Failed to check notification permission', error);
        setPermissionStatus({ granted: false, blocked: false, canAskAgain: true });
      });
  }, []);

  const updatePreferences = useCallback(
    async (updates: Parameters<typeof notificationPreferencesStore.updatePreferences>[0]) => {
      setIsSaving(true);
      try {
        await notificationPreferencesStore.updatePreferences(updates);

        const { preferences } = notificationPreferencesStore.getSnapshot();

        Object.entries(updates).forEach(([key, value]) => {
          if (
            key === 'alertsEnabled' ||
            key === 'soundEnabled' ||
            key === 'vibrationEnabled' ||
            key === 'quietHoursEnabled'
          ) {
            trackTelemetryEvent('settings.notifications_updated', {
              field: key,
              value: Boolean(value),
            });
          }
        });

        if ('quietHoursStart' in updates || 'quietHoursEnd' in updates) {
          trackTelemetryEvent('settings.notifications_updated', {
            field: 'quietHoursRange',
            value: `${preferences.quietHoursStart}-${preferences.quietHoursEnd}`,
          });
        }
      } catch (error) {
        console.warn('[settings] Failed to update notification preferences', error);
        Alert.alert(
          t('settings.entries.notifications.errorTitle'),
          t('settings.entries.notifications.errorBody')
        );
      } finally {
        setIsSaving(false);
      }
    },
    [t]
  );

  const handleToggle = useCallback(
    (field: 'alertsEnabled' | 'soundEnabled' | 'vibrationEnabled' | 'quietHoursEnabled') =>
      async (value: boolean) => {
        await updatePreferences({ [field]: value });
      },
    [updatePreferences]
  );

  const cycleQuietHours = useCallback(async () => {
    const currentIndex = QUIET_HOUR_PRESETS.findIndex(
      (preset) => preset.start === quietHoursStart && preset.end === quietHoursEnd
    );
    const nextPreset =
      QUIET_HOUR_PRESETS[(currentIndex + 1) % QUIET_HOUR_PRESETS.length] ?? QUIET_HOUR_PRESETS[0];
    await updatePreferences({ quietHoursStart: nextPreset.start, quietHoursEnd: nextPreset.end });
  }, [quietHoursEnd, quietHoursStart, updatePreferences]);

  const requestPermission = useCallback(async () => {
    const result = await requestNotificationPermission();
    setPermissionStatus(result);
    trackTelemetryEvent('settings.notifications_permission_requested', {
      granted: result.granted,
      blocked: result.blocked,
      canAskAgain: result.canAskAgain,
    });
  }, []);

  const openSettings = useCallback(async () => {
    await openSystemSettings();
    trackTelemetryEvent('settings.notifications_open_settings', undefined);
  }, []);

  const quietHoursLabel = useMemo(
    () => formatRange(quietHoursStart, quietHoursEnd),
    [quietHoursEnd, quietHoursStart]
  );

  if (!ready || !permissionStatus) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {t('settings.entries.notifications.loading')}
        </Text>
      </SafeAreaView>
    );
  }

  const permissionGranted = permissionStatus.granted;
  const permissionBlocked = permissionStatus.blocked && !permissionStatus.canAskAgain;

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-6 pb-6 pt-6">
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
            {t('settings.entries.notifications.title')}
          </Text>
        </View>
        <Text className="mt-4 text-base text-slate-600 dark:text-slate-400">
          {t('settings.entries.notifications.description')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <View className="space-y-4">
          <View className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t('settings.entries.notifications.permissionTitle')}
                </Text>
                <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {permissionGranted
                    ? t('settings.entries.notifications.permissionGranted')
                    : t('settings.entries.notifications.permissionMissing')}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={permissionBlocked ? openSettings : requestPermission}
                className={`rounded-full px-4 py-2 ${
                  permissionGranted
                    ? 'bg-emerald-100 dark:bg-emerald-500/20'
                    : 'bg-blue-600 dark:bg-blue-500'
                }`}>
                <Text
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    permissionGranted ? 'text-emerald-700 dark:text-emerald-200' : 'text-white'
                  }`}>
                  {permissionGranted
                    ? t('settings.entries.notifications.permissionButtonGranted')
                    : permissionBlocked
                      ? t('settings.entries.notifications.openSettings')
                      : t('settings.entries.notifications.permissionButton')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t('settings.entries.notifications.masterToggle.title')}
                </Text>
                <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {t('settings.entries.notifications.masterToggle.description')}
                </Text>
              </View>
              <Switch
                value={alertsEnabled}
                onValueChange={handleToggle('alertsEnabled')}
                disabled={isSaving}
                thumbColor={alertsEnabled ? '#2563eb' : undefined}
                trackColor={{ false: '#94a3b8', true: '#bfdbfe' }}
              />
            </View>
          </View>

          <View className="space-y-3">
            <View className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {t('settings.entries.notifications.sound.title')}
                  </Text>
                  <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    {t('settings.entries.notifications.sound.description')}
                  </Text>
                </View>
                <Switch
                  value={soundEnabled}
                  onValueChange={handleToggle('soundEnabled')}
                  disabled={!alertsEnabled || isSaving}
                  thumbColor={soundEnabled ? '#2563eb' : undefined}
                  trackColor={{ false: '#94a3b8', true: '#bfdbfe' }}
                />
              </View>
            </View>

            <View className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {t('settings.entries.notifications.vibration.title')}
                  </Text>
                  <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    {t('settings.entries.notifications.vibration.description')}
                  </Text>
                </View>
                <Switch
                  value={vibrationEnabled}
                  onValueChange={handleToggle('vibrationEnabled')}
                  disabled={!alertsEnabled || isSaving}
                  thumbColor={vibrationEnabled ? '#2563eb' : undefined}
                  trackColor={{ false: '#94a3b8', true: '#bfdbfe' }}
                />
              </View>
            </View>
          </View>

          <View className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t('settings.entries.notifications.quietHours.title')}
                </Text>
                <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {t('settings.entries.notifications.quietHours.description', {
                    range: quietHoursLabel,
                  })}
                </Text>
              </View>
              <Switch
                value={quietHoursEnabled}
                onValueChange={handleToggle('quietHoursEnabled')}
                disabled={!alertsEnabled || isSaving}
                thumbColor={quietHoursEnabled ? '#2563eb' : undefined}
                trackColor={{ false: '#94a3b8', true: '#bfdbfe' }}
              />
            </View>
            {quietHoursEnabled ? (
              <TouchableOpacity
                onPress={cycleQuietHours}
                activeOpacity={0.85}
                disabled={isSaving}
                className="mt-4 flex-row items-center justify-between rounded-lg bg-slate-100 px-4 py-3 dark:bg-slate-800">
                <View>
                  <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t('settings.entries.notifications.quietHours.current', {
                      range: quietHoursLabel,
                    })}
                  </Text>
                  <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.entries.notifications.quietHours.helper')}
                  </Text>
                </View>
                <MaterialCommunityIcons name="refresh" size={22} color="#2563eb" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
