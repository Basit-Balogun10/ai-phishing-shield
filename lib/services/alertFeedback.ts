import { flushOutbox, enqueueOutboxEntry } from './networkOutbox';
import { trackTelemetryEvent } from './telemetry';
import {
  buildFeedbackEntry,
  detectionFeedbackStore,
  type DetectionFeedbackEntry,
  type DetectionFeedbackStatus,
} from '../detection/feedback';
import type { DetectionRecord } from '../detection/detectionHistory';

export type SubmitDetectionFeedbackOptions = {
  record: DetectionRecord;
  status: DetectionFeedbackStatus;
};

export type SubmitDetectionFeedbackResult = {
  entry: DetectionFeedbackEntry;
  queued: boolean;
};

export const submitDetectionFeedback = async ({
  record,
  status,
}: SubmitDetectionFeedbackOptions): Promise<SubmitDetectionFeedbackResult> => {
  const entry = buildFeedbackEntry(record, status);

  await detectionFeedbackStore.setFeedback(entry);
  await enqueueOutboxEntry({
    channel: 'feedback',
    payload: {
      recordId: entry.recordId,
      status: entry.status,
      submittedAt: entry.submittedAt,
      source: entry.source,
      channel: entry.channel,
      score: entry.score,
    },
    id: entry.recordId,
    replace: true,
  });

  flushOutbox().catch((error) => {
    if (__DEV__) {
      console.warn('[feedback] Failed to flush outbox', error);
    }
  });

  trackTelemetryEvent('alerts.feedback_submitted', {
    recordId: entry.recordId,
    status: entry.status,
    channel: entry.channel,
    score: entry.score,
    source: entry.source,
  });

  return {
    entry,
    queued: true,
  };
};
