import type { DetectionFeedbackEntry } from '../detection/feedback';
import {
  enqueueOutboxEntry,
  flushOutbox,
  getOutboxSnapshot,
  type OutboxEntry,
} from './networkOutbox';

export type FeedbackOutboxEntry = OutboxEntry & {
  payload: {
    recordId?: string;
    status?: string;
    submittedAt?: string;
    source?: string;
    channel?: string;
    score?: number;
  };
};

const asFeedbackEntry = (entry: OutboxEntry): FeedbackOutboxEntry | null => {
  if (entry.channel !== 'feedback') {
    return null;
  }

  return {
    ...entry,
    payload: {
      recordId: typeof entry.payload.recordId === 'string' ? entry.payload.recordId : undefined,
      status: typeof entry.payload.status === 'string' ? entry.payload.status : undefined,
      submittedAt:
        typeof entry.payload.submittedAt === 'string' ? entry.payload.submittedAt : undefined,
      source: typeof entry.payload.source === 'string' ? entry.payload.source : undefined,
      channel: typeof entry.payload.channel === 'string' ? entry.payload.channel : undefined,
      score: typeof entry.payload.score === 'number' ? entry.payload.score : undefined,
    },
  };
};

export const getFeedbackOutboxSnapshot = async (): Promise<FeedbackOutboxEntry[]> => {
  const snapshot = await getOutboxSnapshot();
  return snapshot
    .map((entry) => asFeedbackEntry(entry))
    .filter((entry): entry is FeedbackOutboxEntry => Boolean(entry));
};

export const enqueueFeedbackForSync = async (entry: DetectionFeedbackEntry) => {
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
};

export const flushFeedbackOutbox = async () => {
  await flushOutbox();
};
