import { Link } from 'expo-router';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnboardingGate } from '../lib/hooks/useOnboardingGate';
import { triggerMockDetectionNow } from '../lib/services/backgroundDetection';
import type { DetectionResult } from '../lib/detection/mockDetection';

type DetectionDisplay = DetectionResult & {
  detectedAt: string;
};

const menuLinkStyles = `px-4 py-3 rounded-xl border border-blue-100 bg-white shadow-sm dark:border-blue-900/60 dark:bg-slate-900 dark:shadow-none`;

type DashboardStat = {
  label: string;
  value: string;
};

type RecentAlert = {
  sender: string;
  preview: string;
  timestamp: string;
};

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { checking, allowed } = useOnboardingGate();
  const [isTriggeringDetection, setIsTriggeringDetection] = useState(false);
  const [lastDetection, setLastDetection] = useState<DetectionDisplay | null>(null);
  const isExpoGo = Constants.appOwnership === 'expo';

  const stats = useMemo<DashboardStat[]>(
    () => [
      {
        label: t('dashboard.stats.messagesScanned'),
        value: '1,248',
      },
      {
        label: t('dashboard.stats.threatsBlocked'),
        value: '36',
      },
      {
        label: t('dashboard.stats.safeMessages'),
        value: '1,212',
      },
    ],
    [t]
  );

  const alerts = useMemo<RecentAlert[]>(
    () => t('dashboard.recentAlerts.items', { returnObjects: true }) as RecentAlert[],
    [t]
  );

  if (checking) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="mt-4 text-sm text-slate-500">{t('common.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (!allowed) {
    return null;
  }

  const timeframe = t('dashboard.stats.defaultTimeframe');
  const statsLength = stats.length;

  const handleReportPress = () => {
    Alert.alert(t('dashboard.report.alertTitle'), t('dashboard.report.alertBody'));
  };

  const handleHistoryPress = () => {
    Alert.alert(
      t('dashboard.recentAlerts.historyAlertTitle'),
      t('dashboard.recentAlerts.historyAlertBody')
    );
  };

  const handleSimulateDetectionPress = async () => {
    try {
      setIsTriggeringDetection(true);
      const outcome = await triggerMockDetectionNow();

      if (outcome.triggered) {
        setLastDetection({
          ...outcome.result,
          detectedAt: new Date().toISOString(),
        });
        Alert.alert(
          t('dashboard.mockDetection.successTitle'),
          t('dashboard.mockDetection.successBody')
        );
      } else {
        setLastDetection(null);
        Alert.alert(
          t('dashboard.mockDetection.noThreatTitle'),
          t('dashboard.mockDetection.noThreatBody')
        );
      }
    } catch (error) {
      console.warn('[dashboard] Failed to trigger mock detection', error);
      Alert.alert(t('dashboard.mockDetection.errorTitle'), t('dashboard.mockDetection.errorBody'));
    } finally {
      setIsTriggeringDetection(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="flex-1">
        <View className="space-y-8 px-6 py-8">
          <View className="space-y-3">
            <Text className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
              {t('dashboard.title')}
            </Text>
            <Text className="text-base text-slate-600 dark:text-slate-400">
              {t('dashboard.subtitle')}
            </Text>
          </View>

          <View className="rounded-3xl bg-blue-600 p-6 shadow-lg dark:shadow-blue-900/40">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-semibold uppercase tracking-wide text-blue-100">
                  {t('dashboard.statusCard.title')}
                </Text>
                <Text className="mt-1 text-lg text-blue-50">
                  {t('dashboard.statusCard.description')}
                </Text>
              </View>
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                <MaterialCommunityIcons name="shield-check" size={40} color="white" />
              </View>
            </View>
            <View className="mt-6 space-y-2">
              <Text className="text-sm text-blue-100">
                {t('dashboard.statusCard.model', { model: 'NLP ZeroDay v0.1' })}
              </Text>
              <Text className="text-sm text-blue-100">
                {t('dashboard.statusCard.lastScan', { time: 'just now' })}
              </Text>
            </View>
          </View>

          <View className="space-y-4">
            <Text className="text-sm font-medium uppercase tracking-wide text-slate-500">
              {t('dashboard.stats.title')}
            </Text>
            <View className="flex-row flex-wrap justify-between">
              {stats.map((stat, index) => (
                <View
                  key={stat.label}
                  className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
                  style={{
                    width:
                      statsLength > 1
                        ? statsLength % 2 === 1 && index === statsLength - 1
                          ? '100%'
                          : '48%'
                        : '100%',
                  }}>
                  <Text className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                    {stat.value}
                  </Text>
                  <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    {stat.label}
                  </Text>
                  <Text className="mt-4 text-xs font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    {t('dashboard.stats.since', { timeframe })}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {isExpoGo ? (
            <View className="flex-row gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/30">
                <MaterialCommunityIcons name="information-outline" size={24} color="#d97706" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {t('dashboard.expoGoNotice.title')}
                </Text>
                <Text className="mt-1 text-sm text-amber-800/90 dark:text-amber-100/90">
                  {t('dashboard.expoGoNotice.body')}
                </Text>
              </View>
            </View>
          ) : null}

          <View className="space-y-3">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.recentAlerts.title')}
                </Text>
                <Text className="text-sm text-slate-500 dark:text-slate-400">
                  {t('dashboard.recentAlerts.subtitle')}
                </Text>
              </View>
              <Pressable onPress={handleHistoryPress} className="px-3 py-2">
                <Text className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {t('dashboard.recentAlerts.viewAll')}
                </Text>
              </Pressable>
            </View>

            <View className="space-y-3">
              {alerts.length === 0 ? (
                <View className="items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                  <MaterialCommunityIcons name="check-circle" size={32} color="#22c55e" />
                  <Text className="mt-3 text-center text-sm text-slate-500 dark:text-slate-300">
                    {t('dashboard.recentAlerts.empty')}
                  </Text>
                </View>
              ) : (
                alerts.map((alert) => (
                  <View
                    key={`${alert.sender}-${alert.timestamp}`}
                    className="flex-row gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <View className="h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-500/20">
                      <MaterialCommunityIcons name="alert" size={24} color="#fb923c" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {alert.sender}
                      </Text>
                      <Text
                        className="mt-1 text-sm text-slate-500 dark:text-slate-300"
                        numberOfLines={2}>
                        {alert.preview}
                      </Text>
                      <Text className="mt-2 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {alert.timestamp}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>

          <View className="space-y-3 rounded-3xl border border-blue-100 bg-blue-50 p-6 dark:border-blue-900/60 dark:bg-blue-500/10">
            <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('dashboard.report.title')}
            </Text>
            <Text className="text-sm text-slate-600 dark:text-slate-300">
              {t('dashboard.report.subtitle')}
            </Text>
            <Pressable
              onPress={handleReportPress}
              className="mt-2 flex-row items-center justify-center rounded-full bg-blue-600 px-5 py-3 active:bg-blue-500 dark:bg-blue-500 dark:active:bg-blue-400">
              <Text className="text-base font-semibold text-white">
                {t('dashboard.report.cta')}
              </Text>
            </Pressable>
          </View>

          <View className="space-y-4">
            <Text className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('dashboard.navigateLabel')}
            </Text>
            <View className="space-y-3">
              <Link href="/onboarding" className={menuLinkStyles}>
                <Text className="text-lg font-medium text-blue-700 dark:text-blue-400">
                  {t('dashboard.links.onboarding.title')}
                </Text>
                <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {t('dashboard.links.onboarding.description')}
                </Text>
              </Link>
              <Link href="/settings" className={menuLinkStyles}>
                <Text className="text-lg font-medium text-blue-700 dark:text-blue-400">
                  {t('dashboard.links.settings.title')}
                </Text>
                <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {t('dashboard.links.settings.description')}
                </Text>
              </Link>
            </View>
          </View>

          <View className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('dashboard.mockDetection.title')}
            </Text>
            <Text className="text-sm text-slate-600 dark:text-slate-300">
              {t('dashboard.mockDetection.subtitle')}
            </Text>
            <Pressable
              disabled={isTriggeringDetection}
              onPress={handleSimulateDetectionPress}
              className={`mt-2 flex-row items-center justify-center rounded-full px-5 py-3 ${
                isTriggeringDetection
                  ? 'bg-slate-400/60 dark:bg-slate-700'
                  : 'bg-slate-900 active:bg-slate-800 dark:bg-blue-500'
              }`}>
              <Text className="text-base font-semibold text-white">
                {isTriggeringDetection
                  ? t('dashboard.mockDetection.runningLabel')
                  : t('dashboard.mockDetection.cta')}
              </Text>
            </Pressable>
            <Text className="text-xs text-slate-400 dark:text-slate-500">
              {t('dashboard.mockDetection.helper')}
            </Text>

            {lastDetection ? (
              <View className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-100/60 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-4">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {lastDetection.message.sender}
                    </Text>
                    <Text className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                      {t('dashboard.mockDetection.detectedAt', {
                        time: new Date(lastDetection.detectedAt).toLocaleTimeString(),
                      })}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                      {t(`dashboard.mockDetection.channels.${lastDetection.message.channel}`)}
                    </Text>
                    <Text className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                      {t('dashboard.mockDetection.scoreLabel', {
                        score: Math.round(lastDetection.score * 100),
                      })}
                    </Text>
                  </View>
                </View>

                <Text
                  className="text-sm italic text-slate-600 dark:text-slate-200"
                  numberOfLines={3}>
                  “{lastDetection.message.body}”
                </Text>

                <View className="space-y-2">
                  {lastDetection.matches.length ? (
                    lastDetection.matches.map((match, index) => (
                      <View
                        key={`${match.label}-${index}`}
                        className="flex-row items-start gap-3 rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/80">
                        <MaterialCommunityIcons name="shield-alert" size={18} color="#fb923c" />
                        <View className="flex-1">
                          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {match.label}
                          </Text>
                          <Text className="mt-1 text-sm text-slate-600 dark:text-slate-200">
                            “{match.excerpt}”
                          </Text>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/80">
                      <Text className="text-sm text-slate-600 dark:text-slate-200">
                        {t('dashboard.mockDetection.noMatches')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <Text className="text-xs text-slate-500 dark:text-slate-400">
                {t('dashboard.mockDetection.noResultPlaceholder')}
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
