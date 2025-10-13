import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ai-phishing-shield/network/outbox';
const LEGACY_FEEDBACK_STORAGE_KEY = '@ai-phishing-shield/alerts/feedback/outbox';
const MAX_RETRY_COUNT = 5;

export type OutboxChannel = 'feedback' | 'telemetry' | 'report';

export type OutboxEntry = {
  id: string;
  channel: OutboxChannel;
  payload: Record<string, unknown>;
  retryCount: number;
  createdAt: string;
};

let hydrated = false;
let hydrating: Promise<void> | null = null;
let queue: OutboxEntry[] = [];
let flushing = false;

const randomId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getEndpoint = (): string | null => {
  const endpoint = process.env.EXPO_PUBLIC_FEEDBACK_ENDPOINT;
  if (endpoint && typeof endpoint === 'string' && endpoint.trim().length > 0) {
    return endpoint.trim();
  }
  return null;
};

const persist = async () => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    if (__DEV__) {
      console.warn('[outbox] Failed to persist network outbox', error);
    }
  }
};

const migrateLegacyFeedbackOutbox = async () => {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_FEEDBACK_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    if (Array.isArray(parsed)) {
      const migrated: OutboxEntry[] = parsed
        .filter((entry) => typeof entry?.recordId === 'string')
        .map((entry) => ({
          id: String(entry.recordId),
          channel: 'feedback',
          payload: {
            recordId: entry.recordId,
            status: entry.status,
            submittedAt: entry.submittedAt,
            source: entry.source,
            channel: entry.channel,
            score: entry.score,
          },
          retryCount: Number.isInteger(entry.retryCount) ? Number(entry.retryCount) : 0,
          createdAt:
            typeof entry.submittedAt === 'string'
              ? (entry.submittedAt as string)
              : new Date().toISOString(),
        }));

      if (migrated.length) {
        const legacyIds = new Set(migrated.map((entry) => entry.id));
        queue = queue.filter((entry) => !legacyIds.has(entry.id)).concat(migrated);
      }
    }

    await AsyncStorage.removeItem(LEGACY_FEEDBACK_STORAGE_KEY);
  } catch (error) {
    if (__DEV__) {
      console.warn('[outbox] Failed to migrate legacy feedback outbox', error);
    }
  }
};

const hydrate = async () => {
  if (hydrated) {
    return;
  }

  if (hydrating) {
    await hydrating;
    return;
  }

  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as OutboxEntry[];
        if (Array.isArray(parsed)) {
          queue = parsed
            .filter((entry) => typeof entry?.channel === 'string')
            .map((entry) => ({
              ...entry,
              id: typeof entry.id === 'string' ? entry.id : randomId(),
              retryCount: Number.isInteger(entry.retryCount) ? entry.retryCount : 0,
              createdAt:
                typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
            }));
        }
      }

      await migrateLegacyFeedbackOutbox();
    } catch (error) {
      if (__DEV__) {
        console.warn('[outbox] Failed to hydrate network outbox', error);
      }
      queue = [];
    } finally {
      hydrated = true;
      hydrating = null;
    }
  })();

  await hydrating;
};

const sendEntry = async (endpoint: string, entry: OutboxEntry): Promise<boolean> => {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: entry.channel,
        payload: entry.payload,
        id: entry.id,
        createdAt: entry.createdAt,
      }),
    });

    if (!response.ok) {
      if (__DEV__) {
        console.warn('[outbox] Server rejected entry', entry.channel, response.status);
      }
      return false;
    }

    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('[outbox] Failed to submit entry', entry.channel, error);
    }
    return false;
  }
};

export const getOutboxSnapshot = async (): Promise<OutboxEntry[]> => {
  await hydrate();
  return [...queue];
};

export const enqueueOutboxEntry = async (params: {
  channel: OutboxChannel;
  payload: Record<string, unknown>;
  id?: string;
  replace?: boolean;
}) => {
  await hydrate();

  const entryId = params.id ?? randomId();
  const existingIndex = queue.findIndex((entry) => entry.id === entryId);
  const retryCount = existingIndex >= 0 ? queue[existingIndex].retryCount : 0;

  const nextEntry: OutboxEntry = {
    id: entryId,
    channel: params.channel,
    payload: params.payload,
    retryCount,
    createdAt: new Date().toISOString(),
  };

  if (existingIndex >= 0 && params.replace) {
    queue.splice(existingIndex, 1, nextEntry);
  } else {
    queue.push(nextEntry);
  }

  await persist();

  return nextEntry;
};

export const flushOutbox = async () => {
  if (flushing) {
    return;
  }

  flushing = true;

  try {
    await hydrate();
    const endpoint = getEndpoint();

    if (!endpoint) {
      if (__DEV__) {
        const byChannel = queue.reduce<Record<string, number>>((acc, entry) => {
          acc[entry.channel] = (acc[entry.channel] ?? 0) + 1;
          return acc;
        }, {});
        const sampleEntries = queue.slice(0, 3).map((entry) => ({
          id: entry.id,
          channel: entry.channel,
          createdAt: entry.createdAt,
          retryCount: entry.retryCount,
        }));

        console.info('[outbox] No endpoint configured; retaining entries locally.', {
          total: queue.length,
          byChannel,
          sample: sampleEntries,
        });
      }
      return;
    }

    const pending = [...queue];
    const retained: OutboxEntry[] = [];

    for (const entry of pending) {
      const sent = await sendEntry(endpoint, entry);
      if (!sent) {
        const retryCount = entry.retryCount + 1;
        if (retryCount >= MAX_RETRY_COUNT) {
          if (__DEV__) {
            console.warn('[outbox] Dropping entry after max retries', entry.id);
          }
          continue;
        }
        retained.push({ ...entry, retryCount });
      }
    }

    queue = retained;
    await persist();
  } finally {
    flushing = false;
  }
};

export const clearOutbox = async () => {
  queue = [];
  hydrated = true;
  await persist();
};
