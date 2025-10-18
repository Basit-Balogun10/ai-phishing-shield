import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { MessageReportCategory } from '../lib/services/messageReports';
import { submitMessageReport } from '../lib/services/messageReports';
import { trackTelemetryEvent } from '../lib/services/telemetry';
import { AppModal } from './AppModal';

type MessageChannel = 'sms' | 'whatsapp' | 'email';

type Props = {
  isVisible: boolean;
  onClose: () => void;
};

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error';

const generateReportId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function ReportMessageModal({ isVisible, onClose }: Props) {
  const { t } = useTranslation();

  const [channel, setChannel] = useState<MessageChannel>('sms');
  const [category, setCategory] = useState<MessageReportCategory>('phishing');
  const [sender, setSender] = useState('');
  const [message, setMessage] = useState('');
  const [comment, setComment] = useState('');
  const [state, setState] = useState<SubmissionState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isVisible) {
      setChannel('sms');
      setCategory('phishing');
      setSender('');
      setMessage('');
      setComment('');
      setState('idle');
      setError(null);
    }
  }, [isVisible]);

  const categoryOptions = useMemo(
    () => [
      { id: 'phishing', label: t('dashboard.report.categories.phishing') },
      { id: 'suspicious', label: t('dashboard.report.categories.suspicious') },
      { id: 'false_positive', label: t('dashboard.report.categories.false_positive') },
      { id: 'other', label: t('dashboard.report.categories.other') },
    ],
    [t]
  );

  const channelOptions = useMemo(
    () => [
      { id: 'sms', label: t('dashboard.report.channels.sms') },
      { id: 'whatsapp', label: t('dashboard.report.channels.whatsapp') },
      { id: 'email', label: t('dashboard.report.channels.email') },
    ],
    [t]
  );

  const canSubmit = message.trim().length > 0 && state !== 'submitting';

  const handleSubmit = useCallback(async () => {
    if (!message.trim()) {
      setError(t('dashboard.report.validation.messageRequired'));
      return;
    }

    try {
      setState('submitting');
      setError(null);

      await submitMessageReport({
        reportId: generateReportId(),
        message: {
          sender: sender.trim(),
          channel,
          body: message.trim(),
          receivedAt: new Date().toISOString(),
        },
        category,
        comment: comment.trim() ? comment.trim() : undefined,
      });

      trackTelemetryEvent('reports.submitted', {
        category,
        channel,
        hasComment: Boolean(comment.trim()),
      });

      setState('success');
      setSender('');
      setMessage('');
      setComment('');
    } catch (submissionError) {
      if (__DEV__) {
        console.warn('[reports] Failed to queue report', submissionError);
      }
      setState('error');
      setError(t('dashboard.report.status.error'));
    }
  }, [category, channel, comment, message, sender, t]);

  const statusCopy = useMemo(() => {
    switch (state) {
      case 'success':
        return t('dashboard.report.status.success');
      case 'error':
        return error ?? t('dashboard.report.status.error');
      case 'submitting':
        return t('dashboard.report.status.submitting');
      default:
        return t('dashboard.report.status.idle');
    }
  }, [error, state, t]);

  return (
    <AppModal isVisible={isVisible} onClose={onClose} avoidKeyboard testID="report-message-modal">
      <View className="flex-1 justify-end">
        <View className="max-h-[90%] rounded-t-3xl bg-white pb-8 pt-4 dark:bg-slate-900">
          <View className="mb-4 h-1 w-16 self-center rounded-full bg-slate-200 dark:bg-slate-700" />
          <View className="flex-row items-start justify-between px-6">
            <View className="flex-1 pr-4">
              <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t('dashboard.report.modalTitle')}
              </Text>
              <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t('dashboard.report.modalSubtitle')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.report.actions.close')}
              activeOpacity={0.7}
              className="h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <MaterialCommunityIcons name="close" size={20} color="#475569" />
            </TouchableOpacity>
          </View>

          <ScrollView
            className="mt-5 px-6"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}>
            <View className="gap-4">
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.report.fields.channelLabel')}
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {channelOptions.map((option) => {
                    const isActive = option.id === channel;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        onPress={() => setChannel(option.id as MessageChannel)}
                        activeOpacity={0.75}
                        className={`rounded-full border px-4 py-2 ${
                          isActive
                            ? 'border-blue-600 bg-blue-600/10 dark:border-blue-400 dark:bg-blue-500/20'
                            : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
                        }`}>
                        <Text
                          className={`text-xs font-semibold uppercase tracking-wide ${
                            isActive
                              ? 'text-blue-700 dark:text-blue-200'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.report.fields.senderLabel')}
                </Text>
                <TextInput
                  value={sender}
                  onChangeText={setSender}
                  placeholder={t('dashboard.report.placeholders.sender')}
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.report.fields.messageLabel')}
                </Text>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t('dashboard.report.placeholders.message')}
                  placeholderTextColor="#94a3b8"
                  multiline
                  textAlignVertical="top"
                  className="mt-2 min-h-[120px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.report.fields.categoryLabel')}
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {categoryOptions.map((option) => {
                    const isActive = option.id === category;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        onPress={() => setCategory(option.id as MessageReportCategory)}
                        activeOpacity={0.75}
                        className={`rounded-full border px-4 py-2 ${
                          isActive
                            ? 'border-emerald-600 bg-emerald-600/10 dark:border-emerald-400 dark:bg-emerald-500/20'
                            : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
                        }`}>
                        <Text
                          className={`text-xs font-semibold uppercase tracking-wide ${
                            isActive
                              ? 'text-emerald-700 dark:text-emerald-200'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.report.fields.commentLabel')}
                </Text>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder={t('dashboard.report.placeholders.comment')}
                  placeholderTextColor="#94a3b8"
                  multiline
                  textAlignVertical="top"
                  className="mt-2 min-h-[80px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </View>

              <View className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.report.status.heading')}
                </Text>
                <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {statusCopy}
                </Text>
              </View>

              {error && state !== 'success' ? (
                <View className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-500/10">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-200">
                    {t('dashboard.report.status.errorTitle')}
                  </Text>
                  <Text className="mt-1 text-sm text-rose-600 dark:text-rose-200">{error}</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View className="mt-6 flex-row gap-3 px-6">
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.75}
              className="flex-1 rounded-full border border-slate-300 px-5 py-3 dark:border-slate-700">
              <Text className="text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
                {state === 'success'
                  ? t('dashboard.report.actions.close')
                  : t('dashboard.report.actions.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              activeOpacity={0.75}
              disabled={!canSubmit}
              className={`flex-1 rounded-full px-5 py-3 ${
                canSubmit ? 'bg-blue-600' : 'bg-blue-300 dark:bg-blue-900/60'
              }`}>
              {state === 'submitting' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-center text-sm font-semibold text-white">
                  {t('dashboard.report.actions.submit')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </AppModal>
  );
}
