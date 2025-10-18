import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { AppModal } from '../../../components/AppModal';
import { useThemePreference } from '../../../lib/hooks/useThemePreference';
import { trackTelemetryEvent } from '../../../lib/services/telemetry';
import { TrustedSource, trustedSourcesStore, useTrustedSources } from '../../../lib/trustedSources';

const channelOptions: {
  key: TrustedSource['channel'];
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
  { key: 'sms', icon: 'message-text-outline' },
  { key: 'whatsapp', icon: 'whatsapp' },
  { key: 'email', icon: 'email-outline' },
];

type TrustedSourceFormState = {
  channel: TrustedSource['channel'];
  handle: string;
  displayName: string;
  note: string;
};

const DEFAULT_FORM_STATE: TrustedSourceFormState = {
  channel: 'sms',
  handle: '',
  displayName: '',
  note: '',
};

export default function TrustedSendersScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { resolvedColorScheme } = useThemePreference();
  const { ready, sources: trustedSources } = useTrustedSources();
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<TrustedSourceFormState>(DEFAULT_FORM_STATE);

  const handleBack = useCallback(() => {
    router.replace('/settings');
  }, [router]);

  const sortedSources = useMemo(() => {
    return [...trustedSources].sort((a, b) => {
      const left = (a.displayName || a.handle).toLowerCase();
      const right = (b.displayName || b.handle).toLowerCase();
      return left.localeCompare(right);
    });
  }, [trustedSources]);

  const openAddModal = () => {
    setFormState(DEFAULT_FORM_STATE);
    setIsAddModalVisible(true);
  };

  const closeAddModal = () => {
    setIsAddModalVisible(false);
  };

  const handleRemoveSource = (source: TrustedSource) => {
    Alert.alert(
      t('settings.entries.trustedSources.removeTitle'),
      source.displayName ?? source.handle,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.entries.trustedSources.removeConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await trustedSourcesStore.removeSource(source.id);
              trackTelemetryEvent('settings.trusted_source_removed', {
                channel: source.channel,
                hadNote: Boolean(source.note?.trim()),
              });
            } catch (error) {
              console.warn('[settings] Failed to remove trusted source', error);
              Alert.alert(
                t('settings.entries.trustedSources.errorTitle'),
                t('settings.entries.trustedSources.errorBody')
              );
            }
          },
        },
      ]
    );
  };

  const handleSubmit = async () => {
    const handleValue = formState.handle.trim();
    if (!handleValue) {
      Alert.alert(
        t('settings.entries.trustedSources.validationTitle'),
        t('settings.entries.trustedSources.validationHandle')
      );
      return;
    }

    const duplicate = trustedSources.some((source) => {
      return (
        source.channel === formState.channel &&
        source.handle.trim().toLowerCase() === handleValue.toLowerCase()
      );
    });

    if (duplicate) {
      Alert.alert(
        t('settings.entries.trustedSources.duplicateTitle'),
        t('settings.entries.trustedSources.duplicateBody')
      );
      return;
    }

    setIsSubmitting(true);

    try {
      await trustedSourcesStore.addSource({
        channel: formState.channel,
        handle: handleValue,
        displayName: formState.displayName.trim(),
        note: formState.note.trim(),
      });
      trackTelemetryEvent('settings.trusted_source_saved', {
        channel: formState.channel,
        hasNote: Boolean(formState.note.trim()),
      });
      setIsAddModalVisible(false);
      setFormState(DEFAULT_FORM_STATE);
      Alert.alert(t('settings.entries.trustedSources.successTitle'));
    } catch (error) {
      console.warn('[settings] Failed to save trusted source', error);
      Alert.alert(
        t('settings.entries.trustedSources.errorTitle'),
        t('settings.entries.trustedSources.errorBody')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {t('common.loading')}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="border-b border-slate-200/70 bg-slate-50 px-6 pb-6 pt-6 dark:border-slate-800 dark:bg-slate-950">
        <View className="relative flex-row items-center justify-center">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('settings.back')}
            onPress={handleBack}
            activeOpacity={0.7}
            className="absolute left-0 rounded-full bg-slate-200 p-2 dark:bg-slate-800">
            <MaterialCommunityIcons
              name="chevron-left"
              size={28}
              color={resolvedColorScheme === 'light' ? '#0f172a' : '#e2e8f0'}
            />
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.entries.trustedSources.title')}
          </Text>
        </View>
        <Text className="mt-4 text-base text-slate-600 dark:text-slate-400">
          {t('settings.entries.trustedSources.description')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        contentInsetAdjustmentBehavior="automatic">
        <View className="px-6 pb-8" style={{ rowGap: 16 }}>
          {ready && sortedSources.length === 0 ? (
            <View className="items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
              <MaterialCommunityIcons name="shield-check" size={36} color="#22c55e" />
              <Text className="mt-3 text-center text-sm text-slate-500 dark:text-slate-300">
                {t('settings.entries.trustedSources.emptyState')}
              </Text>
            </View>
          ) : (
            sortedSources.map((source) => (
              <View
                key={source.id}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {source.displayName ?? source.handle}
                    </Text>
                    <View className="mt-2 flex-row flex-wrap items-center gap-2">
                      <Text className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
                        {t(`dashboard.mockDetection.channels.${source.channel}`)}
                      </Text>
                      <Text className="text-xs font-medium text-slate-500 dark:text-slate-300">
                        {source.handle}
                      </Text>
                      {source.note ? (
                        <Text className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
                          {source.note}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemoveSource(source)}
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.entries.trustedSources.removeA11y', {
                      name: source.displayName ?? source.handle,
                    })}
                    activeOpacity={0.7}
                    className="h-9 w-9 items-center justify-center rounded-full bg-rose-500/10">
                    <MaterialCommunityIcons name="trash-can" size={18} color="#f43f5e" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View className="px-6 pb-8">
        <TouchableOpacity
          onPress={openAddModal}
          activeOpacity={0.85}
          className="flex-row items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 dark:bg-blue-500">
          <MaterialCommunityIcons name="plus-circle" size={20} color="#fff" />
          <Text className="text-sm font-semibold uppercase tracking-wide text-white">
            {t('settings.entries.trustedSources.addButton')}
          </Text>
        </TouchableOpacity>
      </View>

      <AppModal isVisible={isAddModalVisible} onClose={closeAddModal} avoidKeyboard>
        <View className="flex-1 justify-end">
          <View className="max-h-[90%] w-full rounded-t-3xl bg-white dark:bg-slate-900">
            <View className="px-6 pb-5 pt-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t('settings.entries.trustedSources.modalTitle')}
                  </Text>
                  <Text className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    {t('settings.entries.trustedSources.modalSubtitle')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeAddModal}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('dashboard.report.actions.close')}
                  className="h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <MaterialCommunityIcons name="close" size={20} color="#475569" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              className="px-6"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 32 }}>
              <View className="gap-8">
                <View>
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('settings.entries.trustedSources.fields.channel')}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingRight: 16 }}>
                    <View className="flex-row items-center gap-2">
                      {channelOptions.map((option) => {
                        const isActive = formState.channel === option.key;
                        return (
                          <TouchableOpacity
                            key={option.key}
                            activeOpacity={0.85}
                            onPress={() =>
                              setFormState((prev) => ({
                                ...prev,
                                channel: option.key,
                              }))
                            }
                            className={`flex-row items-center gap-2 rounded-full px-4 py-2 ${
                              isActive
                                ? 'bg-blue-600 dark:bg-blue-500'
                                : 'bg-slate-100 dark:bg-slate-800'
                            }`}>
                            <MaterialCommunityIcons
                              name={option.icon}
                              size={16}
                              color={isActive ? '#ffffff' : '#64748b'}
                            />
                            <Text
                              className={`text-xs font-semibold uppercase tracking-wide ${
                                isActive ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                              }`}>
                              {t(`dashboard.mockDetection.channels.${option.key}`)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>

                <View>
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('settings.entries.trustedSources.fields.handle')}
                  </Text>
                  <TextInput
                    value={formState.handle}
                    onChangeText={(text) =>
                      setFormState((prev) => ({
                        ...prev,
                        handle: text,
                      }))
                    }
                    placeholder={t('settings.entries.trustedSources.placeholders.handle')}
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="mt-2 h-12 rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </View>

                <View>
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('settings.entries.trustedSources.fields.displayName')}
                  </Text>
                  <TextInput
                    value={formState.displayName}
                    onChangeText={(text) =>
                      setFormState((prev) => ({
                        ...prev,
                        displayName: text,
                      }))
                    }
                    placeholder={t('settings.entries.trustedSources.placeholders.displayName')}
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="words"
                    className="mt-2 h-12 rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </View>

                <View>
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('settings.entries.trustedSources.fields.note')}
                  </Text>
                  <TextInput
                    value={formState.note}
                    onChangeText={(text) =>
                      setFormState((prev) => ({
                        ...prev,
                        note: text,
                      }))
                    }
                    placeholder={t('settings.entries.trustedSources.placeholders.note')}
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="sentences"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    className="mt-2 min-h-[96px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </View>
              </View>
            </ScrollView>

            <View className="border-t border-slate-200 px-6 py-5 dark:border-slate-800">
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={closeAddModal}
                  disabled={isSubmitting}
                  activeOpacity={0.85}
                  className="flex-1 rounded-full border border-slate-300 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900">
                  <Text className="text-center text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={isSubmitting}
                  activeOpacity={0.85}
                  className={`flex-1 rounded-full px-5 py-3 ${
                    isSubmitting
                      ? 'bg-slate-400/70 dark:bg-slate-700'
                      : 'bg-blue-600 dark:bg-blue-500'
                  }`}>
                  <Text className="text-center text-sm font-semibold text-white">
                    {isSubmitting ? t('settings.entries.trustedSources.saving') : t('common.save')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </AppModal>
    </SafeAreaView>
  );
}
