import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FlatList,
  ListRenderItem,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  ViewToken,
} from 'react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { markOnboardingComplete } from '../lib/storage';
import { requestAllRequiredPermissions } from '../lib/permissions';

type PermissionStep = {
  title: string;
  description: string;
};

type OnboardingSlide = {
  title: string;
  description: string;
  icon: string;
  permissions?: PermissionStep[];
};

export default function OnboardingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { t } = useTranslation();

  const slides = useMemo(
    () => t('onboarding.slides', { returnObjects: true }) as OnboardingSlide[],
    [t]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const flatListRef = useRef<FlatList<OnboardingSlide>>(null);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 55 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const nextIndex = viewableItems[0]?.index;
    if (typeof nextIndex === 'number') {
      setCurrentIndex(nextIndex);
    }
  }).current;

  const handleSkip = useCallback(async () => {
    try {
      setIsCompleting(true);
      await markOnboardingComplete();
      await requestAllRequiredPermissions();
      router.replace('/');
    } finally {
      setIsCompleting(false);
    }
  }, [router]);

  const handleAdvance = useCallback(async () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      return;
    }
    try {
      setIsCompleting(true);
      await markOnboardingComplete();
      await requestAllRequiredPermissions();
      router.replace('/');
    } finally {
      setIsCompleting(false);
    }
  }, [currentIndex, router, slides.length]);

  const renderSlide: ListRenderItem<OnboardingSlide> = ({ item }) => {
    return (
      <View
        style={{ width: width - 48 }}
        className="mr-4 rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20">
          <MaterialCommunityIcons name={item.icon as any} size={36} color="#60a5fa" />
        </View>
        <Text className="mt-6 text-2xl font-semibold text-white">{item.title}</Text>
        <Text className="mt-3 text-base text-slate-300">{item.description}</Text>

        {item.permissions?.length ? (
          <View className="mt-6 space-y-3">
            <Text className="text-sm font-medium uppercase tracking-wide text-blue-300">
              {t('onboarding.permissionStepsTitle')}
            </Text>
            {item.permissions.map((permission) => (
              <View
                key={permission.title}
                className="flex-row gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <View className="mt-1">
                  <MaterialCommunityIcons name="check-circle-outline" size={22} color="#38bdf8" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-white">{permission.title}</Text>
                  <Text className="mt-1 text-sm text-slate-300">{permission.description}</Text>
                </View>
              </View>
            ))}
            <View className="rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4">
              <Text className="text-xs font-medium uppercase tracking-wide text-blue-300">
                {t('onboarding.permissionNoteTitle')}
              </Text>
              <Text className="mt-2 text-sm text-slate-300">
                {t('onboarding.permissionNoteBody')}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const primaryCtaLabel =
    currentIndex === slides.length - 1 ? t('onboarding.start') : t('onboarding.next');

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <View className="flex-1">
        <View className="flex-row items-center justify-between px-6 pt-6">
          <Text className="text-sm font-semibold uppercase tracking-widest text-blue-400">
            {t('onboarding.badge')}
          </Text>
          <Pressable onPress={handleSkip} hitSlop={10} disabled={isCompleting}>
            <Text
              className={`text-sm font-semibold uppercase tracking-wide ${
                isCompleting ? 'text-slate-600' : 'text-slate-400'
              }`}>
              {t('onboarding.skip')}
            </Text>
          </Pressable>
        </View>

        <View className="px-6 pt-4">
          <Text className="text-3xl font-semibold text-white">{t('onboarding.title')}</Text>
          <Text className="mt-3 text-base text-slate-300">{t('onboarding.subtitle')}</Text>
        </View>

        <View className="mt-8 flex-1">
          <FlatList
            ref={flatListRef}
            data={slides}
            keyExtractor={(item) => item.title}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            renderItem={renderSlide}
            contentContainerStyle={{ paddingHorizontal: 24, paddingRight: 32 }}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
        </View>

        <View className="px-6 pb-10">
          <View className="flex-row justify-center gap-2">
            {slides.map((_, index) => (
              <View
                key={index}
                className={`h-2 rounded-full ${
                  index === currentIndex ? 'w-8 bg-blue-400' : 'w-2 bg-slate-700'
                }`}
              />
            ))}
          </View>

          <Pressable
            onPress={handleAdvance}
            disabled={isCompleting}
            className={`mt-8 rounded-full px-5 py-4 ${
              isCompleting ? 'bg-blue-400/60' : 'bg-blue-500 active:bg-blue-400'
            }`}>
            <Text className="text-center text-base font-semibold uppercase tracking-wide text-white">
              {primaryCtaLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
