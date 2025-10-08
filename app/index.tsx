import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnboardingGate } from '../lib/hooks/useOnboardingGate';
import { triggerMockDetectionNow } from '../lib/services/backgroundDetection';

const menuLinkStyles = `px-4 py-3 rounded-xl border border-blue-100 bg-white shadow-sm`;

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
        Alert.alert(
          t('dashboard.mockDetection.successTitle'),
          t('dashboard.mockDetection.successBody')
        );
      } else {
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
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="flex-1">
        <View className="space-y-8 px-6 py-8">
          <View className="space-y-3">
            <Text className="text-3xl font-semibold text-slate-900">{t('dashboard.title')}</Text>
            <Text className="text-base text-slate-600">{t('dashboard.subtitle')}</Text>
          </View>

          <View className="rounded-3xl bg-blue-600 p-6 shadow-lg">
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
                  className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  style={{
                    width:
                      statsLength > 1
                        ? statsLength % 2 === 1 && index === statsLength - 1
                          ? '100%'
                          : '48%'
                        : '100%',
                  }}>
                  <Text className="text-3xl font-semibold text-slate-900">{stat.value}</Text>
                  <Text className="mt-1 text-sm text-slate-500">{stat.label}</Text>
                  <Text className="mt-4 text-xs font-medium uppercase tracking-wide text-blue-600">
                    {t('dashboard.stats.since', { timeframe })}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View className="space-y-3">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-medium uppercase tracking-wide text-slate-500">
                  {t('dashboard.recentAlerts.title')}
                </Text>
                <Text className="text-sm text-slate-500">
                  {t('dashboard.recentAlerts.subtitle')}
                </Text>
              </View>
              <Pressable onPress={handleHistoryPress} className="px-3 py-2">
                <Text className="text-sm font-medium text-blue-600">
                  {t('dashboard.recentAlerts.viewAll')}
                </Text>
              </Pressable>
            </View>

            <View className="space-y-3">
              {alerts.length === 0 ? (
                <View className="items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-6">
                  <MaterialCommunityIcons name="check-circle" size={32} color="#22c55e" />
                  <Text className="mt-3 text-center text-sm text-slate-500">
                    {t('dashboard.recentAlerts.empty')}
                  </Text>
                </View>
              ) : (
                alerts.map((alert) => (
                  <View
                    key={`${alert.sender}-${alert.timestamp}`}
                    className="flex-row gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <View className="h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                      <MaterialCommunityIcons name="alert" size={24} color="#fb923c" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-slate-900">{alert.sender}</Text>
                      <Text className="mt-1 text-sm text-slate-500" numberOfLines={2}>
                        {alert.preview}
                      </Text>
                      <Text className="mt-2 text-xs uppercase tracking-wide text-slate-400">
                        {alert.timestamp}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>

          <View className="space-y-3 rounded-3xl border border-blue-100 bg-blue-50 p-6">
            <Text className="text-lg font-semibold text-slate-900">
              {t('dashboard.report.title')}
            </Text>
            <Text className="text-sm text-slate-600">{t('dashboard.report.subtitle')}</Text>
            <Pressable
              onPress={handleReportPress}
              className="mt-2 flex-row items-center justify-center rounded-full bg-blue-600 px-5 py-3 active:bg-blue-500">
              <Text className="text-base font-semibold text-white">
                {t('dashboard.report.cta')}
              </Text>
            </Pressable>
          </View>

          <View className="space-y-4">
            <Text className="text-sm font-medium uppercase tracking-wide text-slate-500">
              {t('dashboard.navigateLabel')}
            </Text>
            <View className="space-y-3">
              <Link href="/onboarding" className={menuLinkStyles}>
                <Text className="text-lg font-medium text-blue-700">
                  {t('dashboard.links.onboarding.title')}
                </Text>
                <Text className="mt-1 text-sm text-slate-500">
                  {t('dashboard.links.onboarding.description')}
                </Text>
              </Link>
              <Link href="/settings" className={menuLinkStyles}>
                <Text className="text-lg font-medium text-blue-700">
                  {t('dashboard.links.settings.title')}
                </Text>
                <Text className="mt-1 text-sm text-slate-500">
                  {t('dashboard.links.settings.description')}
                </Text>
              </Link>
            </View>
          </View>

          <View className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6">
            <Text className="text-lg font-semibold text-slate-900">
              {t('dashboard.mockDetection.title')}
            </Text>
            <Text className="text-sm text-slate-600">{t('dashboard.mockDetection.subtitle')}</Text>
            <Pressable
              disabled={isTriggeringDetection}
              onPress={handleSimulateDetectionPress}
              className={`mt-2 flex-row items-center justify-center rounded-full px-5 py-3 ${
                isTriggeringDetection ? 'bg-slate-400/60' : 'bg-slate-900'
              }`}>
              <Text className="text-base font-semibold text-white">
                {isTriggeringDetection
                  ? t('dashboard.mockDetection.runningLabel')
                  : t('dashboard.mockDetection.cta')}
              </Text>
            </Pressable>
            <Text className="text-xs text-slate-400">{t('dashboard.mockDetection.helper')}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
