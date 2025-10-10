import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import type { DetectionRecord } from './detectionHistory';

export type DetectionFeedbackStatus = 'confirmed' | 'false_positive';

export type DetectionFeedbackEntry = {
  recordId: string;
  status: DetectionFeedbackStatus;
  submittedAt: string;
  source: DetectionRecord['source'];
  channel: DetectionRecord['result']['message']['channel'];
  score: number;
};

export type DetectionFeedbackSnapshot = Record<string, DetectionFeedbackEntry>;

const STORAGE_KEY = '@ai-phishing-shield/detections/feedback';

let hydrated = false;
let hydrating: Promise<void> | null = null;
let feedbackMap: DetectionFeedbackSnapshot = {};

const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      if (__DEV__) {
        console.warn('[feedback] Listener invocation failed', error);
      }
    }
  });
};

const persist = async () => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(feedbackMap));
  } catch (error) {
    if (__DEV__) {
      console.warn('[feedback] Failed to persist detection feedback', error);
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
        const parsed = JSON.parse(raw) as DetectionFeedbackSnapshot;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          feedbackMap = Object.entries(parsed).reduce<DetectionFeedbackSnapshot>(
            (acc, [key, value]) => {
              if (
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                typeof value.status === 'string'
              ) {
                acc[key] = {
                  recordId: typeof value.recordId === 'string' ? value.recordId : key,
                  status: value.status as DetectionFeedbackStatus,
                  submittedAt:
                    typeof value.submittedAt === 'string'
                      ? value.submittedAt
                      : new Date().toISOString(),
                  source: (value as DetectionFeedbackEntry).source ?? 'historical',
                  channel: (value as DetectionFeedbackEntry).channel ?? 'sms',
                  score: Number.isFinite((value as DetectionFeedbackEntry).score)
                    ? (value as DetectionFeedbackEntry).score
                    : 0,
                };
              }
              return acc;
            },
            {}
          );
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[feedback] Failed to hydrate detection feedback', error);
      }
      feedbackMap = {};
    } finally {
      hydrated = true;
      hydrating = null;
    }
  })();

  await hydrating;
};

const ensureHydrated = async () => {
  if (!hydrated) {
    await hydrate();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): DetectionFeedbackSnapshot => feedbackMap;

export const detectionFeedbackStore = {
  async initialize() {
    await ensureHydrated();
  },
  subscribe,
  getSnapshot,
  async setFeedback(entry: DetectionFeedbackEntry) {
    await ensureHydrated();
    feedbackMap = {
      ...feedbackMap,
      [entry.recordId]: entry,
    };
    await persist();
    emit();
  },
  async clearFeedback(recordId: string) {
    await ensureHydrated();
    if (!(recordId in feedbackMap)) {
      return;
    }
    const next = { ...feedbackMap };
    delete next[recordId];
    feedbackMap = next;
    await persist();
    emit();
  },
  async getFeedback(recordId: string) {
    await ensureHydrated();
    return feedbackMap[recordId] ?? null;
  },
};

export const useDetectionFeedback = (recordId: string | null) => {
  const [ready, setReady] = useState(hydrated);

  useEffect(() => {
    if (!hydrated) {
      detectionFeedbackStore.initialize().then(() => setReady(true));
    } else if (!ready) {
      setReady(true);
    }
  }, [ready]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => ({
      ready,
      feedback: recordId ? (snapshot[recordId] ?? null) : null,
    }),
    [recordId, ready, snapshot]
  );
};

export const buildFeedbackEntry = (
  record: DetectionRecord,
  status: DetectionFeedbackStatus
): DetectionFeedbackEntry => ({
  recordId: record.recordId,
  status,
  submittedAt: new Date().toISOString(),
  source: record.source,
  channel: record.result.message.channel,
  score: record.result.score,
});
