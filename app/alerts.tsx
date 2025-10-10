import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMemo, useCallback, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppModal } from '../components/AppModal';
import { type DetectionRecord, useDetectionHistory } from '../lib/detection/detectionHistory';

type AlertFilter = 'all' | 'historical' | 'simulated';

const AlertFilterChip = ({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      className={`rounded-full px-3 py-1 ${
        isActive ? 'bg-blue-600/10 dark:bg-blue-500/20' : 'bg-slate-100 dark:bg-slate-800'
      }`}>
      <Text
        className={`text-xs font-semibold uppercase tracking-wide ${
          isActive ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-300'
        }`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
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

const AlertsScreen = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { merged: detectionHistory } = useDetectionHistory();
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [selectedDetection, setSelectedDetection] = useState<DetectionRecord | null>(null);

  const filterOptions = useMemo(
    () => [
      { key: 'all' as const, label: t('dashboard.recentAlerts.filters.all') },
      { key: 'historical' as const, label: t('dashboard.recentAlerts.filters.historical') },
      { key: 'simulated' as const, label: t('dashboard.recentAlerts.filters.simulated') },
    ],
    [t]
  );

  const filteredDetections = useMemo(() => {
    if (filter === 'all') {
      return detectionHistory;
    }

    return detectionHistory.filter((record) => record.source === filter);
  }, [detectionHistory, filter]);

  const formatDetectedAt = useCallback((value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="flex-row items-center justify-between px-5 py-4">
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          className="h-10 w-10 items-center justify-center rounded-full bg-slate-200/60 dark:bg-slate-800/70">
          <MaterialCommunityIcons name="arrow-left" size={20} color="#0f172a" />
        </TouchableOpacity>
        <View className="flex-1 px-4">
          <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('dashboard.recentAlerts.title')}
          </Text>
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            {t('dashboard.recentAlerts.subtitle')}
          </Text>
        </View>
        <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-600/10 dark:bg-blue-500/20">
          <MaterialCommunityIcons name="shield-alert" size={20} color="#2563eb" />
        </View>
      </View>

      <View className="px-5 pb-4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
          <View className="flex-row gap-2 px-1">
            {filterOptions.map((option) => (
              <AlertFilterChip
                key={option.key}
                label={option.label}
                isActive={filter === option.key}
                onPress={() => setFilter(option.key)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 32 }}>
        {filteredDetections.length === 0 ? (
          <View className="items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
            <MaterialCommunityIcons name="check-circle" size={40} color="#22c55e" />
            <Text className="mt-4 text-center text-sm text-slate-500 dark:text-slate-300">
              {t('dashboard.recentAlerts.empty')}
            </Text>
          </View>
        ) : (
          filteredDetections.map((entry) => {
            const { badge, text: severityText, iconColor } = getSeverityColor(entry.result.score);
            const primaryMatch = entry.result.matches[0];

            return (
              <TouchableOpacity
                key={entry.recordId}
                onPress={() => setSelectedDetection(entry)}
                activeOpacity={0.85}
                className="mb-4 flex-row gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
      </ScrollView>

      <AppModal
        isVisible={Boolean(selectedDetection)}
        onClose={() => setSelectedDetection(null)}
        testID="alerts-detection-detail-modal">
        <View className="flex-1 justify-end">
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
      </AppModal>
    </SafeAreaView>
  );
};

export default AlertsScreen;
