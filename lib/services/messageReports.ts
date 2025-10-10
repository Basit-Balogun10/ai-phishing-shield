import { enqueueOutboxEntry, flushOutbox } from './networkOutbox';

export type MessageReportCategory = 'phishing' | 'suspicious' | 'false_positive' | 'other';

export type MessageReportPayload = {
  reportId: string;
  message: {
    sender: string;
    channel: 'sms' | 'whatsapp' | 'email';
    body: string;
    receivedAt?: string;
  };
  category: MessageReportCategory;
  comment?: string;
  createdAt?: string;
  attachments?: string[];
};

export type SubmitMessageReportResult = {
  queued: boolean;
};

export const submitMessageReport = async (
  payload: MessageReportPayload
): Promise<SubmitMessageReportResult> => {
  const createdAt = payload.createdAt ?? new Date().toISOString();

  await enqueueOutboxEntry({
    channel: 'report',
    payload: {
      reportId: payload.reportId,
      message: payload.message,
      category: payload.category,
      comment: payload.comment,
      createdAt,
      attachments: payload.attachments,
    },
    id: payload.reportId,
    replace: true,
  });

  flushOutbox().catch((error) => {
    if (__DEV__) {
      console.warn('[reports] Failed to flush outbox', error);
    }
  });

  return {
    queued: true,
  };
};
