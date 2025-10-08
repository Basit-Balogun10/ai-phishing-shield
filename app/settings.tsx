import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useOnboardingGate } from '../lib/hooks/useOnboardingGate';
import { useThemePreference } from '../lib/hooks/useThemePreference';
import type { ThemePreference } from '../lib/storage';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { checking, allowed } = useOnboardingGate();
  const { preference, resolvedColorScheme, setPreference, ready } = useThemePreference();
  const router = useRouter();

  const handleThemeChange = (value: ThemePreference) => async () => {
    await setPreference(value);
  };

  if (checking || !ready) {
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
          onPress={() => Alert.alert(t('common.comingSoonTitle'), t('common.comingSoonBody'))}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <Text className="text-lg font-medium text-slate-900 dark:text-slate-100">
            {t('settings.entries.language.title')}
          </Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
            {t('settings.entries.language.description')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => Alert.alert(t('common.comingSoonTitle'), t('common.comingSoonBody'))}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <Text className="text-lg font-medium text-slate-900 dark:text-slate-100">
            {t('settings.entries.notifications.title')}
          </Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
            {t('settings.entries.notifications.description')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => Alert.alert(t('common.comingSoonTitle'), t('common.comingSoonBody'))}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <Text className="text-lg font-medium text-slate-900 dark:text-slate-100">
            {t('settings.entries.diagnostics.title')}
          </Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
            {t('settings.entries.diagnostics.description')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
