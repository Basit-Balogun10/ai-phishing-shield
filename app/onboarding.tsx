import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ListRenderItem,
  Platform,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewToken,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { markOnboardingComplete } from '../lib/storage';
import {
  checkNotificationPermission,
  checkSmsPermission,
  openSystemSettings,
  PermissionRequestResult,
  PermissionStatus,
  requestNotificationPermission,
  requestSmsPermission,
} from '../lib/permissions';
import { useOnboardingGate } from '../lib/hooks/useOnboardingGate';
import { initializeMockBackgroundDetectionAsync } from '../lib/services/backgroundDetection';
import { derivePermissionOutcome, trackTelemetryEvent } from '../lib/services/telemetry';

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
  const { t, i18n } = useTranslation();
  const { checking, allowed } = useOnboardingGate({
    redirectIfIncomplete: null,
    redirectIfComplete: '/',
  });

  const slides = useMemo(
    () => t('onboarding.slides', { returnObjects: true }) as OnboardingSlide[],
    [t]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const flatListRef = useRef<FlatList<OnboardingSlide>>(null);
  const [permissionState, setPermissionState] = useState<PermissionRequestResult | null>(null);
  const [checkingPermissions, setCheckingPermissions] = useState(true);
  const [requestingNotifications, setRequestingNotifications] = useState(false);
  const [requestingSms, setRequestingSms] = useState(false);
  const lastTrackedSlideIndex = useRef<number | null>(null);
  const permissionStepTracked = useRef(false);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 55 }).current;
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const nextIndex = viewableItems[0]?.index;
      if (typeof nextIndex === 'number') {
        setCurrentIndex(nextIndex);
      }
    },
    []
  );

  const loadPermissions = useCallback(async () => {
    setCheckingPermissions(true);
    const [notifications, sms] = await Promise.all([
      checkNotificationPermission(),
      checkSmsPermission(),
    ]);
    setPermissionState({ notifications, sms });
    setCheckingPermissions(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      trackTelemetryEvent('onboarding.screen_opened', {
        locale: i18n.language,
        platform: Platform.OS,
      });
      loadPermissions();
    }, [i18n.language, loadPermissions])
  );

  const smsIsRequired = useMemo(() => {
    if (!permissionState) {
      return true;
    }
    return !(permissionState.sms.unavailable ?? false);
  }, [permissionState]);

  const allRequiredPermissionsGranted = useMemo(() => {
    if (!permissionState) {
      return false;
    }

    const notificationsGranted = permissionState.notifications.granted;
    const smsGranted = smsIsRequired ? permissionState.sms.granted : true;

    return notificationsGranted && smsGranted;
  }, [permissionState, smsIsRequired]);

  const handleSkip = useCallback(() => {
    trackTelemetryEvent('onboarding.skip_pressed', undefined);
    Alert.alert(t('onboarding.skipDialog.title'), t('onboarding.skipDialog.body'), [
      { text: t('onboarding.skipDialog.cancel'), style: 'cancel' },
      {
        text: t('onboarding.skipDialog.confirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            setIsCompleting(true);
            await markOnboardingComplete();
            trackTelemetryEvent('onboarding.completed', {
              notificationsGranted: permissionState?.notifications.granted ?? false,
              smsGranted: permissionState?.sms.granted ?? false,
              smsRequired: smsIsRequired,
            });
            router.replace('/');
          } finally {
            setIsCompleting(false);
          }
        },
      },
    ]);
  }, [permissionState, router, smsIsRequired, t]);

  const handleAdvance = useCallback(async () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      return;
    }

    if (currentIndex === slides.length - 1) {
      setCurrentIndex(slides.length);
      return;
    }
    try {
      if (!allRequiredPermissionsGranted) {
        Alert.alert(
          t('onboarding.permissions.incompleteTitle'),
          t('onboarding.permissions.incompleteBody')
        );
        return;
      }

      setIsCompleting(true);
      trackTelemetryEvent('onboarding.completed', {
        notificationsGranted: permissionState?.notifications.granted ?? false,
        smsGranted: permissionState?.sms.granted ?? false,
        smsRequired: smsIsRequired,
      });
      await markOnboardingComplete();
      await initializeMockBackgroundDetectionAsync();
      router.replace('/');
    } finally {
      setIsCompleting(false);
    }
  }, [
    allRequiredPermissionsGranted,
    currentIndex,
    permissionState,
    router,
    slides.length,
    smsIsRequired,
    t,
  ]);

  const requestNotifications = useCallback(async () => {
    try {
      setRequestingNotifications(true);
      trackTelemetryEvent('onboarding.permission_request_started', {
        permission: 'notifications',
      });
      const status = await requestNotificationPermission();
      trackTelemetryEvent('onboarding.permission_request_completed', {
        permission: 'notifications',
        outcome: derivePermissionOutcome(status),
        canAskAgain: status.canAskAgain,
      });
      setPermissionState((prev) => ({
        notifications: status,
        sms: prev?.sms ?? { granted: false, blocked: false, canAskAgain: true },
      }));
    } finally {
      setRequestingNotifications(false);
    }
  }, []);

  const requestSms = useCallback(async () => {
    if (!smsIsRequired) {
      return;
    }
    try {
      setRequestingSms(true);
      trackTelemetryEvent('onboarding.permission_request_started', {
        permission: 'sms',
      });
      const status = await requestSmsPermission();
      trackTelemetryEvent('onboarding.permission_request_completed', {
        permission: 'sms',
        outcome: derivePermissionOutcome(status),
        canAskAgain: status.canAskAgain,
      });
      setPermissionState((prev) => ({
        notifications: prev?.notifications ?? { granted: false, blocked: false, canAskAgain: true },
        sms: status,
      }));
    } finally {
      setRequestingSms(false);
    }
  }, [smsIsRequired]);

  const renderStatusPill = useCallback(
    (status: PermissionStatus, isLoading: boolean) => {
      const pillBase =
        'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide border';
      if (isLoading) {
        return (
          <View className={`${pillBase} border-blue-400 bg-blue-400/20`}>
            <Text className="text-blue-100">{t('onboarding.permissions.status.requesting')}</Text>
          </View>
        );
      }

      if (status.granted) {
        return (
          <View className={`${pillBase} border-emerald-400 bg-emerald-400/20`}>
            <Text className="text-emerald-100">{t('onboarding.permissions.status.granted')}</Text>
          </View>
        );
      }

      if (status.blocked || !status.canAskAgain) {
        return (
          <View className={`${pillBase} border-amber-400 bg-amber-400/20`}>
            <Text className="text-amber-100">{t('onboarding.permissions.status.blocked')}</Text>
          </View>
        );
      }

      return (
        <View className={`${pillBase} border-slate-500 bg-slate-800`}>
          <Text className="text-slate-200">{t('onboarding.permissions.status.required')}</Text>
        </View>
      );
    },
    [t]
  );

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

  const guardBlocked = checking && !allowed;
  const isPermissionStep = currentIndex >= slides.length;
  const primaryCtaLabel = isPermissionStep
    ? t('onboarding.permissions.finishCta')
    : t('onboarding.next');

  const primaryCtaDisabled =
    isPermissionStep && (!allRequiredPermissionsGranted || isCompleting || checkingPermissions);

  useEffect(() => {
    lastTrackedSlideIndex.current = null;
  }, [slides]);

  useEffect(() => {
    if (isPermissionStep) {
      return;
    }

    if (!slides.length) {
      return;
    }

    if (lastTrackedSlideIndex.current === currentIndex) {
      return;
    }

    trackTelemetryEvent('onboarding.slide_viewed', {
      index: currentIndex,
      total: slides.length,
    });
    lastTrackedSlideIndex.current = currentIndex;
  }, [currentIndex, isPermissionStep, slides]);

  useEffect(() => {
    if (!permissionState) {
      return;
    }

    if (isPermissionStep) {
      if (!permissionStepTracked.current) {
        trackTelemetryEvent('onboarding.permission_step_viewed', {
          notificationsGranted: permissionState.notifications.granted,
          smsGranted: permissionState.sms.granted,
          smsRequired: smsIsRequired,
        });
        permissionStepTracked.current = true;
      }
    } else {
      permissionStepTracked.current = false;
    }
  }, [isPermissionStep, permissionState, smsIsRequired]);

  const renderPermissionStep = () => {
    if (!permissionState) {
      return (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text className="mt-4 text-sm text-slate-400">
            {t('onboarding.permissions.checking')}
          </Text>
        </View>
      );
    }

    return (
      <View className="flex-1 px-6">
        <View className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <Text className="text-xl font-semibold text-white">
            {t('onboarding.permissions.title')}
          </Text>
          <Text className="mt-3 text-sm text-slate-300">
            {t('onboarding.permissions.subtitle')}
          </Text>

          <View className="mt-6 space-y-4">
            <View className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-base font-semibold text-white">
                    {t('onboarding.permissions.notifications.title')}
                  </Text>
                  <Text className="mt-2 text-sm text-slate-300">
                    {t('onboarding.permissions.notifications.description')}
                  </Text>
                </View>
                {renderStatusPill(permissionState.notifications, requestingNotifications)}
              </View>

              <TouchableOpacity
                onPress={requestNotifications}
                disabled={permissionState.notifications.granted || requestingNotifications}
                activeOpacity={0.85}
                className={`mt-4 flex-row items-center justify-center rounded-full px-4 py-3 ${
                  permissionState.notifications.granted ? 'bg-emerald-500/20' : 'bg-blue-500'
                }`}>
                {requestingNotifications ? (
                  <ActivityIndicator size="small" color="#e2e8f0" />
                ) : (
                  <Text className="text-sm font-semibold uppercase tracking-wide text-slate-50">
                    {permissionState.notifications.granted
                      ? t('onboarding.permissions.notifications.grantedCta')
                      : t('onboarding.permissions.notifications.cta')}
                  </Text>
                )}
              </TouchableOpacity>

              {permissionState.notifications.blocked && (
                <TouchableOpacity
                  onPress={() => {
                    trackTelemetryEvent('onboarding.system_settings_opened', {
                      permission: 'notifications',
                    });
                    openSystemSettings();
                  }}
                  activeOpacity={0.8}
                  className="mt-2 items-center">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                    {t('onboarding.permissions.notifications.openSettings')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-base font-semibold text-white">
                    {t('onboarding.permissions.sms.title')}
                  </Text>
                  <Text className="mt-2 text-sm text-slate-300">
                    {smsIsRequired
                      ? t('onboarding.permissions.sms.description')
                      : t('onboarding.permissions.sms.unavailable')}
                  </Text>
                </View>
                {renderStatusPill(permissionState.sms, requestingSms)}
              </View>

              {smsIsRequired ? (
                <TouchableOpacity
                  onPress={requestSms}
                  disabled={permissionState.sms.granted || requestingSms}
                  activeOpacity={0.85}
                  className={`mt-4 flex-row items-center justify-center rounded-full px-4 py-3 ${
                    permissionState.sms.granted ? 'bg-emerald-500/20' : 'bg-blue-500'
                  }`}>
                  {requestingSms ? (
                    <ActivityIndicator size="small" color="#e2e8f0" />
                  ) : (
                    <Text className="text-sm font-semibold uppercase tracking-wide text-slate-50">
                      {permissionState.sms.granted
                        ? t('onboarding.permissions.sms.grantedCta')
                        : t('onboarding.permissions.sms.cta')}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}

              {smsIsRequired && permissionState.sms.blocked && (
                <TouchableOpacity
                  onPress={() => {
                    trackTelemetryEvent('onboarding.system_settings_opened', {
                      permission: 'sms',
                    });
                    openSystemSettings();
                  }}
                  activeOpacity={0.8}
                  className="mt-2 items-center">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                    {t('onboarding.permissions.sms.openSettings')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View className="rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4">
              <Text className="text-xs font-semibold uppercase tracking-wide text-blue-300">
                {t('onboarding.permissionNoteTitle')}
              </Text>
              <Text className="mt-2 text-sm text-slate-300">
                {t('onboarding.permissionNoteBody')}
              </Text>
            </View>
          </View>
        </View>

        {!allRequiredPermissionsGranted && (
          <Text className="mt-6 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
            {t('onboarding.permissions.continueHelper')}
          </Text>
        )}
      </View>
    );
  };

  if (guardBlocked) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-950">
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text className="mt-4 text-base text-slate-400">{t('common.loading')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <View className="flex-1">
        <View className="flex-row items-center justify-between px-6 pt-6">
          <Text className="text-sm font-semibold uppercase tracking-widest text-blue-400">
            {t('onboarding.badge')}
          </Text>
          <TouchableOpacity
            onPress={handleSkip}
            hitSlop={10}
            activeOpacity={0.7}
            disabled={isCompleting}>
            <Text
              className={`text-sm font-semibold uppercase tracking-wide ${
                isCompleting ? 'text-slate-600' : 'text-slate-400'
              }`}>
              {t('onboarding.skip')}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="px-6 pt-4">
          <Text className="text-3xl font-semibold text-white">{t('onboarding.title')}</Text>
          <Text className="mt-3 text-base text-slate-300">{t('onboarding.subtitle')}</Text>
        </View>

        <View className="mt-8 flex-1">
          {isPermissionStep ? (
            renderPermissionStep()
          ) : (
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
          )}
        </View>

        <View className="px-6 pb-10">
          {!isPermissionStep ? (
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
          ) : null}

          <TouchableOpacity
            onPress={handleAdvance}
            disabled={primaryCtaDisabled}
            activeOpacity={0.9}
            className={`mt-8 rounded-full px-5 py-4 ${
              primaryCtaDisabled ? 'bg-blue-400/40' : 'bg-blue-500 active:bg-blue-400'
            }`}>
            <Text className="text-center text-base font-semibold uppercase tracking-wide text-white">
              {primaryCtaLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
