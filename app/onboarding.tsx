import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, Text, View } from 'react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type OnboardingCard = {
  title: string;
  description: string;
};

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const cards = useMemo(
    () => t('onboarding.cards', { returnObjects: true }) as OnboardingCard[],
    [t]
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <ScrollView contentContainerStyle={{ paddingVertical: 32 }} className="px-6">
        <View className="space-y-6">
          <View className="space-y-3">
            <Text className="text-sm font-semibold tracking-widest text-blue-400">
              {t('onboarding.badge')}
            </Text>
            <Text className="text-3xl font-semibold text-white">{t('onboarding.title')}</Text>
            <Text className="text-base text-slate-300">{t('onboarding.subtitle')}</Text>
          </View>

          <View className="space-y-4">
            {cards.map((card) => (
              <View
                key={card.title}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <Text className="text-xl font-semibold text-white">{card.title}</Text>
                <Text className="mt-2 text-base text-slate-300">{card.description}</Text>
              </View>
            ))}
          </View>

          <View className="pt-8">
            <Link href="/" className="rounded-full bg-blue-500 px-5 py-4 active:bg-blue-400">
              <Text className="text-center text-base font-semibold uppercase tracking-wide text-white">
                {t('onboarding.continue')}
              </Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
