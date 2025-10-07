import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

const menuLinkStyles = `px-4 py-3 rounded-xl border border-blue-100 bg-white shadow-sm`; // tailwind classes

export default function DashboardScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="space-y-6 px-6 py-8">
        <View className="space-y-2">
          <Text className="text-3xl font-semibold text-slate-900">{t('dashboard.title')}</Text>
          <Text className="text-base text-slate-600">{t('dashboard.subtitle')}</Text>
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
      </View>
    </SafeAreaView>
  );
}
