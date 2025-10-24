import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ai-phishing-shield/network/outbox';
const LEGACY_FEEDBACK_STORAGE_KEY = '@ai-phishing-shield/alerts/feedback/outbox';

// Configurable runtime parameters (can be tweaked in app init)
let MAX_RETRY_COUNT = 5;
let BASE_BACKOFF_SECONDS = 2; // used as multiplier for exponential backoff
let MAX_BACKOFF_SECONDS = 3600; // cap backoff at 1 hour

// Optional auth and device headers
let authToken: string | null = null;
let deviceId: string | null = null;

// Optional hook for telemetry when entries are dropped permanently
let onDropCallback: ((entry: OutboxEntry, reason: string) => void) | null = null;

export const setOutboxConfig = (opts: Partial<{ maxRetryCount: number; baseBackoffSeconds: number; maxBackoffSeconds: number }>) => {
  if (typeof opts.maxRetryCount === 'number') MAX_RETRY_COUNT = opts.maxRetryCount;
  if (typeof opts.baseBackoffSeconds === 'number') BASE_BACKOFF_SECONDS = opts.baseBackoffSeconds;
  if (typeof opts.maxBackoffSeconds === 'number') MAX_BACKOFF_SECONDS = opts.maxBackoffSeconds;
};

export const setAuthToken = (token: string | null) => { authToken = token; };
export const setDeviceId = (id: string | null) => { deviceId = id; };
export const setOnDropCallback = (cb: ((entry: OutboxEntry, reason: string) => void) | null) => { onDropCallback = cb; };

export type OutboxChannel = 'feedback' | 'telemetry' | 'report';

export type OutboxEntry = {
  id: string;
  channel: OutboxChannel;
  payload: Record<string, unknown>;
  retryCount: number;
  createdAt: string;
  // ISO timestamp when this entry becomes next eligible to send. If absent or in the past, it's eligible now.
  nextAttemptAt?: string | null;
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

const parseRetryAfter = (header?: string | null): number | null => {
  if (!header) return null;
  // If numeric seconds
  const secs = Number(header);
  if (!Number.isNaN(secs) && secs >= 0) return Math.floor(secs);

  // Try parse HTTP-date
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const diff = Math.floor((date - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  }
  return null;
};

type SendResult =
  | { status: 'success' }
  | { status: 'permanent-failure' }
  | { status: 'retry-later'; retryAfterSeconds?: number }
  | { status: 'transient-failure' };

const sendEntry = async (endpoint: string, entry: OutboxEntry): Promise<SendResult> => {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    if (deviceId) headers['X-Device-Id'] = deviceId;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        channel: entry.channel,
        payload: entry.payload,
        id: entry.id,
        createdAt: entry.createdAt,
      }),
    });

    // 2xx — success
    if (response.ok) {
      return { status: 'success' };
    }

    const status = response.status;

    // 409 — canonical duplicate: treat as success (server already has it)
    if (status === 409) {
      return { status: 'success' };
    }

    // 400 / 413 — permanent failure, drop the entry
    if (status === 400 || status === 413) {
      return { status: 'permanent-failure' };
    }

    // 429 — rate limited. Honor Retry-After header if present
    if (status === 429) {
      const ra = parseRetryAfter(response.headers.get('retry-after')) ?? parseRetryAfter(response.headers.get('Retry-After'));
      if (ra !== null) {
        return { status: 'retry-later', retryAfterSeconds: ra };
      }
      // Fallback to transient failure if no header
      return { status: 'transient-failure' };
    }

    // 5xx — transient failure
    if (status >= 500 && status < 600) {
      return { status: 'transient-failure' };
    }

    // Other statuses — treat as transient by default
    return { status: 'transient-failure' };
  } catch (error) {
    if (__DEV__) {
      console.warn('[outbox] Failed to submit entry', entry.channel, error);
    }
    return { status: 'transient-failure' };
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

    const now = Date.now();

    for (const entry of pending) {
      // skip entries scheduled for later
      if (entry.nextAttemptAt) {
        const nextTs = Date.parse(entry.nextAttemptAt);
        if (!Number.isNaN(nextTs) && nextTs > now) {
          retained.push(entry);
          continue;
        }
      }

      const result = await sendEntry(endpoint, entry);

      if (result.status === 'success') {
        // dropped (succeeded)
        continue;
      }

      if (result.status === 'permanent-failure') {
        if (__DEV__) {
          console.warn('[outbox] Dropping entry due to permanent failure', entry.id);
        }
        continue;
      }

      // transient or retry-later
      const retryCount = entry.retryCount + 1;

      // compute nextAttemptAt and decide whether to drop
      let nextAttemptAt: string | null = null;

      if (result.status === 'retry-later' && typeof result.retryAfterSeconds === 'number') {
        nextAttemptAt = new Date(Date.now() + result.retryAfterSeconds * 1000).toISOString();
      } else {
        const capped = Math.min(MAX_BACKOFF_SECONDS, Math.pow(2, Math.min(retryCount, 10)) * BASE_BACKOFF_SECONDS);
        nextAttemptAt = new Date(Date.now() + capped * 1000).toISOString();
      }

      if (retryCount >= MAX_RETRY_COUNT) {
        if (__DEV__) {
          console.warn('[outbox] Dropping entry after max retries', entry.id);
        }
        try { onDropCallback?.(entry, 'max-retries'); } catch { }
        continue;
      }

      retained.push({ ...entry, retryCount, nextAttemptAt });
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
