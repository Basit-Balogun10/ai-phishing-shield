import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useThemePreference } from '../../../lib/hooks/useThemePreference';
import {
  buildDiagnosticsSnapshot,
  formatDiagnosticsSnapshot,
  type DiagnosticsSnapshot,
} from '../../../lib/services/diagnostics';

const formatBoolean = (value: boolean, yes: string, no: string) => (value ? yes : no);

const formatDateTime = (value: string | null, fallback: string) => {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

export default function DiagnosticsSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { resolvedColorScheme } = useThemePreference();
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await buildDiagnosticsSnapshot();
      setSnapshot(result);
    } catch (err) {
      console.warn('[diagnostics] Failed to build snapshot', err);
      setError('load_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const handleRefresh = useCallback(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const handleShare = useCallback(async () => {
    if (!snapshot) {
      return;
    }

    try {
      await Share.share({
        message: formatDiagnosticsSnapshot(snapshot),
        title: t('settings.diagnostics.shareTitle'),
      });
    } catch (err) {
      console.warn('[diagnostics] Failed to share snapshot', err);
      Alert.alert(
        t('settings.diagnostics.shareErrorTitle'),
        t('settings.diagnostics.shareErrorBody')
      );
    }
  }, [snapshot, t]);

  const yesLabel = t('settings.diagnostics.values.yes');
  const noLabel = t('settings.diagnostics.values.no');
  const noneLabel = t('settings.diagnostics.values.none');
  const unknownLabel = t('settings.diagnostics.values.unknown');

  const sections = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const formatPermission = (status: DiagnosticsSnapshot['notifications']['permission']) => {
      if (status.unavailable) {
        return t('settings.diagnostics.values.permission.unavailable');
      }

      if (status.granted) {
        return t('settings.diagnostics.values.permission.granted');
      }

      if (status.blocked) {
        return t('settings.diagnostics.values.permission.blocked');
      }

      return t('settings.diagnostics.values.permission.denied');
    };

    return [
      {
        title: t('settings.diagnostics.sections.environment'),
        rows: [
          {
            label: t('settings.diagnostics.fields.platform'),
            value: snapshot.environment.platform,
          },
          {
            label: t('settings.diagnostics.fields.appOwnership'),
            value: snapshot.environment.appOwnership ?? unknownLabel,
          },
          {
            label: t('settings.diagnostics.fields.appVersion'),
            value: snapshot.environment.appVersion ?? unknownLabel,
          },
          {
            label: t('settings.diagnostics.fields.buildNumber'),
            value: snapshot.environment.buildNumber ?? unknownLabel,
          },
        ],
      },
      {
        title: t('settings.diagnostics.sections.localization'),
        rows: [
          {
            label: t('settings.diagnostics.fields.activeLocale'),
            value: snapshot.localization.activeLocale,
          },
          {
            label: t('settings.diagnostics.fields.deviceLocale'),
            value: snapshot.localization.deviceLocale,
          },
          {
            label: t('settings.diagnostics.fields.storedLocale'),
            value: snapshot.localization.storedLocale ?? noneLabel,
          },
        ],
      },
      {
        title: t('settings.diagnostics.sections.theme'),
        rows: [
          {
            label: t('settings.diagnostics.fields.storedPreference'),
            value: snapshot.theme.storedPreference ?? noneLabel,
          },
        ],
      },
      {
        title: t('settings.diagnostics.sections.notifications'),
        rows: [
          {
            label: t('settings.diagnostics.fields.notificationPermission'),
            value: formatPermission(snapshot.notifications.permission),
          },
          {
            label: t('settings.diagnostics.fields.alertsEnabled'),
            value: formatBoolean(
              snapshot.notifications.preferences.alertsEnabled,
              yesLabel,
              noLabel
            ),
          },
          {
            label: t('settings.diagnostics.fields.soundEnabled'),
            value: formatBoolean(
              snapshot.notifications.preferences.soundEnabled,
              yesLabel,
              noLabel
            ),
          },
          {
            label: t('settings.diagnostics.fields.vibrationEnabled'),
            value: formatBoolean(
              snapshot.notifications.preferences.vibrationEnabled,
              yesLabel,
              noLabel
            ),
          },
          {
            label: t('settings.diagnostics.fields.quietHoursEnabled'),
            value: formatBoolean(
              snapshot.notifications.preferences.quietHoursEnabled,
              yesLabel,
              noLabel
            ),
          },
          {
            label: t('settings.diagnostics.fields.quietHoursActive'),
            value: formatBoolean(snapshot.notifications.quietHoursActive, yesLabel, noLabel),
          },
          {
            label: t('settings.diagnostics.fields.quietHoursWindow'),
            value: snapshot.notifications.preferences.quietHoursEnabled
              ? `${snapshot.notifications.preferences.quietHoursStart} – ${snapshot.notifications.preferences.quietHoursEnd}`
              : noneLabel,
          },
        ],
      },
      {
        title: t('settings.diagnostics.sections.sms'),
        rows: [
          {
            label: t('settings.diagnostics.fields.smsPermission'),
            value: formatPermission(snapshot.sms.permission),
          },
        ],
      },
      {
        title: t('settings.diagnostics.sections.detections'),
        rows: [
          {
            label: t('settings.diagnostics.fields.historicalCount'),
            value: snapshot.detections.historicalCount.toString(),
          },
          {
            label: t('settings.diagnostics.fields.simulatedCount'),
            value: snapshot.detections.simulatedCount.toString(),
          },
          {
            label: t('settings.diagnostics.fields.lastSimulatedAt'),
            value: formatDateTime(snapshot.detections.lastSimulatedAt, noneLabel),
          },
        ],
      },
      {
        title: t('settings.diagnostics.sections.trustedSources'),
        rows: [
          {
            label: t('settings.diagnostics.fields.trustedSourcesTotal'),
            value: snapshot.trustedSources.total.toString(),
          },
        ],
      },
      {
        title: t('settings.diagnostics.sections.telemetry'),
        rows: [
          {
            label: t('settings.diagnostics.fields.telemetryEvents'),
            value: snapshot.telemetry.totalEvents.toString(),
          },
          {
            label: t('settings.diagnostics.fields.telemetryLatest'),
            value: formatDateTime(snapshot.telemetry.latestEventAt, noneLabel),
          },
        ],
      },
    ];
  }, [snapshot, t, yesLabel, noLabel, noneLabel, unknownLabel]);

  const renderContent = () => {
    if (loading) {
      return (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563eb" />
          <Text className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {t('settings.diagnostics.loading')}
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View className="flex-1 items-center justify-center px-6">
          <MaterialCommunityIcons name="alert-circle" size={48} color="#f97316" />
          <Text className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.diagnostics.errorTitle')}
          </Text>
          <Text className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('settings.diagnostics.errorBody')}
          </Text>
          <TouchableOpacity
            onPress={handleRefresh}
            activeOpacity={0.85}
            className="mt-6 rounded-full bg-blue-600 px-6 py-3 dark:bg-blue-500">
            <Text className="text-sm font-semibold text-white">
              {t('settings.diagnostics.retry')}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!snapshot) {
      return null;
    }

    return (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}>
        <View className="space-y-5">
          <View className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <Text className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('settings.diagnostics.lastGenerated', {
                date: formatDateTime(snapshot.generatedAt, unknownLabel),
              })}
            </Text>
            <Text className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              {t('settings.diagnostics.disclaimer')}
            </Text>
            <View className="mt-4 flex-row gap-3">
              <TouchableOpacity
                onPress={handleRefresh}
                activeOpacity={0.85}
                className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                <Text className="text-center text-sm font-semibold text-slate-600 dark:text-slate-200">
                  {t('settings.diagnostics.refreshButton')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleShare}
                activeOpacity={0.85}
                className="flex-1 rounded-full bg-blue-600 px-4 py-3 dark:bg-blue-500">
                <Text className="text-center text-sm font-semibold text-white">
                  {t('settings.diagnostics.shareButton')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {sections.map((section) => (
            <View
              key={section.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {section.title}
              </Text>
              <View className="mt-4 space-y-3">
                {section.rows.map((row) => (
                  <View key={row.label} className="flex-row items-start justify-between gap-4">
                    <Text className="flex-1 text-sm text-slate-500 dark:text-slate-400">
                      {row.label}
                    </Text>
                    <Text className="max-w-[55%] text-right text-sm font-medium text-slate-900 dark:text-slate-100">
                      {row.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-6 pb-4 pt-6">
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
            {t('settings.entries.diagnostics.title')}
          </Text>
          {snapshot ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('settings.diagnostics.shareButton')}
              onPress={handleShare}
              activeOpacity={0.7}
              className="absolute right-0 rounded-full bg-blue-600 p-2 dark:bg-blue-500">
              <MaterialCommunityIcons name="share-variant" size={20} color="#ffffff" />
            </TouchableOpacity>
          ) : null}
        </View>
        <Text className="mt-4 text-base text-slate-600 dark:text-slate-400">
          {t('settings.entries.diagnostics.description')}
        </Text>
      </View>

      <View className="flex-1">{renderContent()}</View>
    </SafeAreaView>
  );
}
