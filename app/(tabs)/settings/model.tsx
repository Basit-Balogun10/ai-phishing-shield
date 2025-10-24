import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import modelManagerStore, { useModelManager } from '../../../lib/modelManager';
import { trackTelemetryEvent } from '../../../lib/services/telemetry';

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

export default function ModelManagementScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    ready,
    available,
    installed,
    current,
    lastSyncedAt,
    status,
    activeOperation,
    downloadProgress,
    syncCatalog,
  } = useModelManager();
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'available' | 'installed'>('available');

  const handleBack = useCallback(() => {
    router.replace('/settings');
  }, [router]);

  useEffect(() => {
    trackTelemetryEvent('model_manager.screen_viewed', {
      installedCount: installed.length,
      availableCount: available.length,
    });
  }, [available.length, installed.length]);

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, DATE_FORMAT_OPTIONS), []);

  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt) {
      return t('settings.model.neverSynced');
    }

    try {
      return t('settings.model.lastSynced', {
        time: dateFormatter.format(new Date(lastSyncedAt)),
      });
    } catch {
      return t('settings.model.lastSynced', {
        time: lastSyncedAt,
      });
    }
  }, [dateFormatter, lastSyncedAt, t]);

  const availableOnly = useMemo(() => {
    const installedSet = new Set(installed.map((item) => item.version).filter(Boolean));
    return available
      .filter((entry): entry is typeof entry & { version: string } => Boolean(entry?.version))
      .filter((entry) => !installedSet.has(entry.version));
  }, [available, installed]);

  const tabOptions = useMemo(
    () => [
      {
        key: 'available' as const,
        label: t('settings.model.availableTitle'),
        count: availableOnly.length,
      },
      {
        key: 'installed' as const,
        label: t('settings.model.installedTitle'),
        count: installed.length,
      },
    ],
    [availableOnly.length, installed.length, t]
  );

  const syncBusy = isSyncing || status === 'syncing';

  const renderVersionCard = (version: string) => {
    const availableEntry = available.find((item) => item.version === version);
    const installedEntry = installed.find((item) => item.version === version);
    const isInstalled = Boolean(installedEntry);
    const isCurrent = current?.version === version;
    const badgeLabel = isCurrent
      ? t('settings.model.badges.current')
      : isInstalled
        ? t('settings.model.badges.installed')
        : undefined;
    const changelog = availableEntry?.changelog ?? [];
    const releaseDate = availableEntry?.releasedAt
      ? dateFormatter.format(new Date(availableEntry.releasedAt))
      : null;
    const sizeLabel = availableEntry?.sizeMB
      ? t('settings.model.sizeLabel', { size: availableEntry.sizeMB })
      : undefined;
    const operationMatches = activeOperation?.version === version;
    const isDownloading = operationMatches && status === 'downloading';
    const isSyncingVersion = operationMatches && activeOperation?.type === 'sync';
    const isRemoving = operationMatches && activeOperation?.type === 'remove';
    const isActivating = operationMatches && activeOperation?.type === 'activate';
    const disableActions = isDownloading || isRemoving || isActivating || isSyncingVersion;
    const showDownloadProgress = isDownloading && typeof downloadProgress === 'number';
    const downloadPercent = showDownloadProgress
      ? Math.min(100, Math.max(0, Math.round(downloadProgress * 100)))
      : null;

    const handleInstall = async () => {
      trackTelemetryEvent('model_manager.install_requested', { version });
      try {
        await modelManagerStore.installVersion(version);
        trackTelemetryEvent('model_manager.install_completed', { version });
        Alert.alert(
          t('settings.model.alerts.installSuccessTitle'),
          t('settings.model.alerts.installSuccessBody', { version })
        );
      } catch {
        trackTelemetryEvent('model_manager.install_failed', { version });
        Alert.alert(
          t('settings.model.alerts.installErrorTitle'),
          t('settings.model.alerts.installErrorBody', { version })
        );
      }
    };

    const handleActivate = async () => {
      trackTelemetryEvent('model_manager.activate_requested', { version });
      try {
        await modelManagerStore.activateVersion(version);
        trackTelemetryEvent('model_manager.activate_completed', { version });
        Alert.alert(
          t('settings.model.alerts.activateSuccessTitle'),
          t('settings.model.alerts.activateSuccessBody', { version })
        );
      } catch {
        trackTelemetryEvent('model_manager.activate_failed', { version });
        Alert.alert(
          t('settings.model.alerts.activateErrorTitle'),
          t('settings.model.alerts.activateErrorBody')
        );
      }
    };

    const confirmRemove = () => {
      Alert.alert(
        t('settings.model.alerts.removeConfirmTitle'),
        t('settings.model.alerts.removeConfirmBody', { version }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('settings.model.alerts.removeConfirmAction'),
            style: 'destructive',
            onPress: handleRemove,
          },
        ]
      );
    };

    const handleRemove = async () => {
      trackTelemetryEvent('model_manager.remove_requested', { version });
      try {
        await modelManagerStore.removeVersion(version);
        trackTelemetryEvent('model_manager.remove_completed', { version });
        Alert.alert(
          t('settings.model.alerts.removeSuccessTitle'),
          t('settings.model.alerts.removeSuccessBody', { version })
        );
      } catch {
        trackTelemetryEvent('model_manager.remove_failed', { version });
        Alert.alert(
          t('settings.model.alerts.removeErrorTitle'),
          t('settings.model.alerts.removeErrorBody', { version })
        );
      }
    };

    return (
      <View
        key={version}
        className="mb-4 rounded-xl border border-slate-200 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-900/80">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {version}
            </Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {badgeLabel ? (
                <Text className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
                  {badgeLabel}
                </Text>
              ) : null}
              {sizeLabel ? (
                <Text className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-700 dark:bg-slate-700/40 dark:text-slate-200">
                  {sizeLabel}
                </Text>
              ) : null}
              {releaseDate ? (
                <Text className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-700 dark:bg-slate-700/40 dark:text-slate-200">
                  {t('settings.model.releaseDate', { date: releaseDate })}
                </Text>
              ) : null}
              {isDownloading ? (
                <Text className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                  {t('dashboard.hero.modelStatus.downloading', { version })}
                </Text>
              ) : null}
            </View>
            {changelog.length ? (
              <View className="mt-3 space-y-2">
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('settings.model.changelogTitle')}
                </Text>
                {changelog.map((item, index) => (
                  <View key={`${version}-change-${index}`} className="flex-row items-start gap-2">
                    <Text className="mt-1 text-xs text-blue-500">•</Text>
                    <Text className="flex-1 text-sm text-slate-600 dark:text-slate-300">
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View className="mt-4 flex-row flex-wrap gap-3">
          {!isInstalled ? (
            <TouchableOpacity
              onPress={handleInstall}
              disabled={disableActions}
              className={`flex-1 rounded-full px-4 py-2 ${
                disableActions ? 'bg-slate-300 dark:bg-slate-700' : 'bg-blue-600 dark:bg-blue-500'
              }`}
              activeOpacity={0.85}>
              <Text className="text-center text-sm font-semibold uppercase tracking-wide text-white">
                {isDownloading ? t('settings.model.syncing') : t('settings.model.actions.install')}
              </Text>
            </TouchableOpacity>
          ) : null}

          {isInstalled && !isCurrent ? (
            <TouchableOpacity
              onPress={handleActivate}
              disabled={disableActions}
              className={`flex-1 rounded-full border px-4 py-2 ${
                disableActions
                  ? 'border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800'
                  : 'border-blue-500 bg-white dark:border-blue-400 dark:bg-slate-900'
              }`}
              activeOpacity={0.85}>
              <Text
                className={`text-center text-sm font-semibold uppercase tracking-wide ${
                  disableActions
                    ? 'text-slate-500 dark:text-slate-300'
                    : 'text-blue-600 dark:text-blue-300'
                }`}>
                {isActivating ? t('settings.model.syncing') : t('settings.model.actions.activate')}
              </Text>
            </TouchableOpacity>
          ) : null}

          {isInstalled ? (
            <TouchableOpacity
              onPress={confirmRemove}
              disabled={disableActions}
              className={`flex-1 rounded-full border px-4 py-2 ${
                disableActions
                  ? 'border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800'
                  : 'border-rose-500 bg-rose-50 dark:border-rose-500/60 dark:bg-rose-500/10'
              }`}
              activeOpacity={0.85}>
              <Text
                className={`text-center text-sm font-semibold uppercase tracking-wide ${
                  disableActions ? 'text-slate-500 dark:text-slate-300' : 'text-rose-600'
                }`}>
                {isRemoving ? t('settings.model.syncing') : t('settings.model.actions.remove')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {showDownloadProgress && downloadPercent !== null ? (
          <View className="mt-4">
            <View className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <View
                style={{ width: `${downloadPercent}%` }}
                className="h-full rounded-full bg-blue-600 dark:bg-blue-400"
              />
            </View>
            <Text className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-300">
              {t('settings.model.downloadProgress', { progress: downloadPercent })}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const handleSync = async () => {
    setIsSyncing(true);
    trackTelemetryEvent('model_manager.sync_requested', undefined);
    const success = await syncCatalog();
    setIsSyncing(false);

    if (success) {
      trackTelemetryEvent('model_manager.sync_completed', undefined);
    } else {
      trackTelemetryEvent('model_manager.sync_failed', undefined);
      Alert.alert(
        t('settings.model.alerts.syncErrorTitle'),
        t('settings.model.alerts.syncErrorBody')
      );
    }
  };

  if (!ready) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          {t('common.loading')}
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
            <MaterialCommunityIcons name="chevron-left" size={28} color="#0f172a" />
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.model.title')}
          </Text>
        </View>
        <Text className="mt-4 text-base text-slate-600 dark:text-slate-400">
          {t('settings.model.subtitle')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        contentInsetAdjustmentBehavior="automatic">
        <View className="px-6 pb-8" style={{ rowGap: 24 }}>
          <View className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {lastSyncedLabel}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleSync}
                disabled={syncBusy}
                className={`rounded-full px-4 py-2 ${
                  syncBusy ? 'bg-slate-300 dark:bg-slate-700' : 'bg-blue-600 dark:bg-blue-500'
                }`}
                activeOpacity={0.85}>
                <Text className="text-xs font-semibold uppercase tracking-wide text-white">
                  {syncBusy ? t('settings.model.syncing') : t('settings.model.syncButton')}
                </Text>
              </TouchableOpacity>
            </View>

            <View className="my-3 space-y-6">
              <View className="mb-3 rounded-full bg-slate-100 p-1 dark:bg-slate-800">
                <View className="flex-row items-center justify-between">
                  {tabOptions.map((tab) => {
                    const isActive = activeTab === tab.key;

                    return (
                      <TouchableOpacity
                        key={tab.key}
                        onPress={() => setActiveTab(tab.key)}
                        activeOpacity={0.85}
                        className={`flex-1 flex-row items-center justify-center gap-1 rounded-full px-3 py-2 ${
                          isActive ? 'bg-white dark:bg-slate-900' : 'bg-transparent'
                        }`}>
                        <Text
                          className={`text-xs font-semibold uppercase tracking-wide ${
                            isActive
                              ? 'text-blue-600 dark:text-blue-300'
                              : 'text-slate-500 dark:text-slate-300'
                          }`}>
                          {tab.label}
                        </Text>
                        {typeof tab.count === 'number' ? (
                          <Text
                            className={`text-xs font-semibold ${
                              isActive
                                ? 'text-blue-600 dark:text-blue-200'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}>
                            {tab.count}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {activeTab === 'available' ? (
                <View>
                  {availableOnly.length === 0 ? (
                    <Text className="text-sm text-slate-500 dark:text-slate-300">
                      {t('settings.model.availableEmpty')}
                    </Text>
                  ) : (
                    availableOnly.map((item) => renderVersionCard(item.version))
                  )}
                </View>
              ) : null}

              {activeTab === 'installed' ? (
                <View>
                  {installed.length === 0 ? (
                    <Text className="text-sm text-slate-500 dark:text-slate-300">
                      {t('settings.model.installedEmpty')}
                    </Text>
                  ) : (
                    installed
                      .map((item) => item.version)
                      .filter(Boolean)
                      .map((version) => renderVersionCard(version))
                  )}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
