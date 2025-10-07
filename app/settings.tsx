import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function SettingsScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="space-y-6 px-6 py-8">
        <View className="space-y-2">
          <Text className="text-3xl font-semibold text-slate-900">{t('settings.title')}</Text>
          <Text className="text-base text-slate-600">{t('settings.subtitle')}</Text>
        </View>

        <View className="space-y-4">
          <Pressable className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <Text className="text-lg font-medium text-slate-900">
              {t('settings.entries.language.title')}
            </Text>
            <Text className="mt-1 text-sm text-slate-500">
              {t('settings.entries.language.description')}
            </Text>
          </Pressable>

          <Pressable className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <Text className="text-lg font-medium text-slate-900">
              {t('settings.entries.notifications.title')}
            </Text>
            <Text className="mt-1 text-sm text-slate-500">
              {t('settings.entries.notifications.description')}
            </Text>
          </Pressable>

          <Pressable className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <Text className="text-lg font-medium text-slate-900">
              {t('settings.entries.diagnostics.title')}
            </Text>
            <Text className="mt-1 text-sm text-slate-500">
              {t('settings.entries.diagnostics.description')}
            </Text>
          </Pressable>
        </View>

        <View className="pt-4">
          <Link href="/" className="text-base font-semibold text-blue-600">
            {t('settings.back')}
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}
