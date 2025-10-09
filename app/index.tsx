import { Link } from 'expo-router';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnboardingGate } from '../lib/hooks/useOnboardingGate';
import { triggerMockDetectionNow } from '../lib/services/backgroundDetection';
import type { DetectionResult } from '../lib/detection/mockDetection';
import { analyzeMessage, getMockMessages } from '../lib/detection/mockDetection';

type DetectionRecord = {
  recordId: string;
  result: DetectionResult;
  detectedAt: string;
  source: 'historical' | 'simulated';
};

const menuLinkStyles = `px-4 py-3 rounded-xl border border-blue-100 bg-white shadow-sm dark:border-blue-900/60 dark:bg-slate-900 dark:shadow-none`;

type DashboardStat = {
  label: string;
  value: string;
};

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { checking, allowed, permissions, permissionsSatisfied } = useOnboardingGate();
  const [isTriggeringDetection, setIsTriggeringDetection] = useState(false);
  const [lastDetection, setLastDetection] = useState<DetectionRecord | null>(null);
  const [selectedDetection, setSelectedDetection] = useState<DetectionRecord | null>(null);
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

  const historicalDetections = useMemo<DetectionRecord[]>(() => {
    return getMockMessages()
      .map((message) => {
        const result = analyzeMessage(message);
        return {
          recordId: message.id,
          result,
          detectedAt: message.receivedAt,
          source: 'historical' as const,
        };
      })
      .filter((record) => record.result.score >= 0.6)
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }, []);

  const detectionEntries = useMemo<DetectionRecord[]>(() => {
    if (!lastDetection) {
      return historicalDetections;
    }

    const filteredHistorical = historicalDetections.filter((record) => {
      if (record.result.message.id !== lastDetection.result.message.id) {
        return true;
      }

      return record.detectedAt !== lastDetection.detectedAt;
    });

    return [lastDetection, ...filteredHistorical];
  }, [historicalDetections, lastDetection]);

  const formatDetectedAt = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();

    const timePart = date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (sameDay) {
      return timePart;
    }

    const datePart = date.toLocaleDateString();
    return `${datePart} • ${timePart}`;
  };

  const getSeverityColor = (score: number) => {
    if (score >= 0.85) {
      return {
        badge: 'bg-rose-100 dark:bg-rose-500/20',
        text: 'text-rose-700 dark:text-rose-200',
        iconColor: '#dc2626',
      };
    }

    if (score >= 0.7) {
      return {
        badge: 'bg-amber-100 dark:bg-amber-500/20',
        text: 'text-amber-700 dark:text-amber-200',
        iconColor: '#d97706',
      };
    }

    return {
      badge: 'bg-blue-100 dark:bg-blue-500/20',
      text: 'text-blue-700 dark:text-blue-200',
      iconColor: '#2563eb',
    };
  };

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

  const smsRequired = permissions ? !(permissions.sms.unavailable ?? false) : true;
  const missingPermissions: string[] = [];
  if (permissions) {
    if (!permissions.notifications.granted) {
      missingPermissions.push(t('onboarding.permissions.notifications.title'));
    }
    if (smsRequired && !permissions.sms.granted) {
      missingPermissions.push(t('onboarding.permissions.sms.title'));
    }
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
        const detection: DetectionRecord = {
          recordId: `${outcome.result.message.id}:${Date.now()}`,
          result: outcome.result,
          detectedAt: new Date().toISOString(),
          source: 'simulated',
        };

        setLastDetection(detection);
        setSelectedDetection(detection);
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
          {!permissionsSatisfied ? (
            <View className="flex-row gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-500/10">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/30">
                <MaterialCommunityIcons name="alert-circle" size={22} color="#be123c" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                  {t('dashboard.permissionsReminder.title')}
                </Text>
                <Text className="mt-1 text-sm text-rose-900/90 dark:text-rose-100/90">
                  {t('dashboard.permissionsReminder.body')}
                </Text>
                {missingPermissions.length > 0 ? (
                  <View className="mt-2 space-y-1">
                    {missingPermissions.map((label) => (
                      <Text
                        key={label}
                        className="text-xs font-medium uppercase tracking-wide text-rose-800 dark:text-rose-200">
                        • {label}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <Link href="/onboarding" asChild>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    className="mt-3 w-full items-center justify-center rounded-full bg-rose-600 px-4 py-2 dark:bg-rose-500">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-white">
                      {t('dashboard.permissionsReminder.cta')}
                    </Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          ) : null}

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
              <TouchableOpacity
                onPress={handleHistoryPress}
                activeOpacity={0.7}
                className="px-3 py-2">
                <Text className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {t('dashboard.recentAlerts.viewAll')}
                </Text>
              </TouchableOpacity>
            </View>

            <View className="space-y-3">
              {detectionEntries.length === 0 ? (
                <View className="items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                  <MaterialCommunityIcons name="check-circle" size={32} color="#22c55e" />
                  <Text className="mt-3 text-center text-sm text-slate-500 dark:text-slate-300">
                    {t('dashboard.recentAlerts.empty')}
                  </Text>
                </View>
              ) : (
                detectionEntries.map((entry) => {
                  const {
                    badge,
                    text: severityText,
                    iconColor,
                  } = getSeverityColor(entry.result.score);
                  const primaryMatch = entry.result.matches[0];

                  return (
                    <TouchableOpacity
                      key={entry.recordId}
                      onPress={() => setSelectedDetection(entry)}
                      activeOpacity={0.85}
                      className="flex-row gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <View className="h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-500/20">
                        <MaterialCommunityIcons name="alert" size={24} color={iconColor} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {entry.result.message.sender}
                          </Text>
                          <View className={`rounded-full px-3 py-1 ${badge}`}>
                            <Text
                              className={`text-xs font-semibold uppercase tracking-wide ${severityText}`}>
                              {t('dashboard.mockDetection.scoreLabel', {
                                score: Math.round(entry.result.score * 100),
                              })}
                            </Text>
                          </View>
                        </View>

                        <Text
                          className="mt-1 text-sm text-slate-500 dark:text-slate-300"
                          numberOfLines={2}>
                          {entry.result.message.body}
                        </Text>

                        <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-1">
                          <Text className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                            {formatDetectedAt(entry.detectedAt)}
                          </Text>
                          <Text className="text-xs font-medium uppercase tracking-wide text-blue-500 dark:text-blue-300">
                            {t(`dashboard.mockDetection.channels.${entry.result.message.channel}`)}
                          </Text>
                          {primaryMatch ? (
                            <Text
                              className="text-xs text-slate-500 dark:text-slate-400"
                              numberOfLines={1}>
                              {primaryMatch.label}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
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
            <TouchableOpacity
              onPress={handleReportPress}
              activeOpacity={0.85}
              className="mt-2 flex-row items-center justify-center rounded-full bg-blue-600 px-5 py-3 dark:bg-blue-500">
              <Text className="text-base font-semibold text-white">
                {t('dashboard.report.cta')}
              </Text>
            </TouchableOpacity>
          </View>

          <View className="space-y-4">
            <Text className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('dashboard.navigateLabel')}
            </Text>
            <View className="space-y-3">
              <Link href="/onboarding" asChild>
                <TouchableOpacity activeOpacity={0.85} className={menuLinkStyles}>
                  <Text className="text-lg font-medium text-blue-700 dark:text-blue-400">
                    {t('dashboard.links.onboarding.title')}
                  </Text>
                  <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    {t('dashboard.links.onboarding.description')}
                  </Text>
                </TouchableOpacity>
              </Link>
              <Link href="/settings" asChild>
                <TouchableOpacity activeOpacity={0.85} className={menuLinkStyles}>
                  <Text className="text-lg font-medium text-blue-700 dark:text-blue-400">
                    {t('dashboard.links.settings.title')}
                  </Text>
                  <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    {t('dashboard.links.settings.description')}
                  </Text>
                </TouchableOpacity>
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
            <TouchableOpacity
              disabled={isTriggeringDetection}
              onPress={handleSimulateDetectionPress}
              activeOpacity={0.85}
              className={`mt-2 flex-row items-center justify-center rounded-full px-5 py-3 ${
                isTriggeringDetection
                  ? 'bg-slate-400/60 dark:bg-slate-700'
                  : 'bg-slate-900 dark:bg-blue-500'
              }`}>
              <Text className="text-base font-semibold text-white">
                {isTriggeringDetection
                  ? t('dashboard.mockDetection.runningLabel')
                  : t('dashboard.mockDetection.cta')}
              </Text>
            </TouchableOpacity>
            <Text className="text-xs text-slate-400 dark:text-slate-500">
              {t('dashboard.mockDetection.helper')}
            </Text>
            {lastDetection ? (
              <TouchableOpacity
                onPress={() => setSelectedDetection(lastDetection)}
                activeOpacity={0.85}
                className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-100/60 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-4">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {lastDetection.result.message.sender}
                    </Text>
                    <Text className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                      {t('dashboard.mockDetection.detectedAt', {
                        time: new Date(lastDetection.detectedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                      })}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                      {t(
                        `dashboard.mockDetection.channels.${lastDetection.result.message.channel}`
                      )}
                    </Text>
                    <Text className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                      {t('dashboard.mockDetection.scoreLabel', {
                        score: Math.round(lastDetection.result.score * 100),
                      })}
                    </Text>
                  </View>
                </View>

                <Text
                  className="text-sm italic text-slate-600 dark:text-slate-200"
                  numberOfLines={3}>
                  “{lastDetection.result.message.body}”
                </Text>

                <Text className="text-xs text-blue-600 dark:text-blue-300">
                  {t('dashboard.mockDetection.successTitle')}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text className="text-xs text-slate-500 dark:text-slate-400">
                {t('dashboard.mockDetection.noResultPlaceholder')}
              </Text>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedDetection)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDetection(null)}>
        <View className="flex-1 justify-end bg-slate-900/40">
          <View className="w-full rounded-t-3xl bg-white p-6 dark:bg-slate-900">
            {selectedDetection ? (
              <View className="space-y-4">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-4">
                    <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {selectedDetection.result.message.sender}
                    </Text>
                    <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {formatDetectedAt(selectedDetection.detectedAt)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedDetection(null)}
                    activeOpacity={0.7}
                    className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      {t('common.back')}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View className="flex-row flex-wrap items-center gap-3">
                  <Text className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
                    {t(
                      `dashboard.mockDetection.channels.${selectedDetection.result.message.channel}`
                    )}
                  </Text>
                  <Text className="text-sm text-slate-500 dark:text-slate-300">
                    {t('dashboard.mockDetection.scoreLabel', {
                      score: Math.round(selectedDetection.result.score * 100),
                    })}
                  </Text>
                  {selectedDetection.source === 'simulated' ? (
                    <Text className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      • {t('dashboard.mockDetection.successTitle')}
                    </Text>
                  ) : null}
                </View>

                <Text className="text-sm text-slate-700 dark:text-slate-200">
                  “{selectedDetection.result.message.body}”
                </Text>

                <View className="space-y-2">
                  {selectedDetection.result.matches.length ? (
                    selectedDetection.result.matches.map((match, index) => (
                      <View
                        key={`${match.label}-${index}`}
                        className="flex-row items-start gap-3 rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/80">
                        <MaterialCommunityIcons name="shield-alert" size={18} color="#fb923c" />
                        <View className="flex-1">
                          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {match.label}
                          </Text>
                          <Text className="mt-1 text-sm text-slate-600 dark:text-slate-200">
                            “{match.excerpt || match.label}”
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
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
