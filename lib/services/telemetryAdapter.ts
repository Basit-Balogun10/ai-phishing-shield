import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  setTelemetryAdapter,
  type EventName,
  type TelemetryAdapter,
  type TelemetryPayloads,
} from './telemetry';
import { enqueueOutboxEntry, flushOutbox } from './networkOutbox';

export type TelemetryEventEnvelope<E extends EventName = EventName> = {
  name: E;
  payload: TelemetryPayloads[E];
  timestamp: string;
};

const STORAGE_KEY = '@ai-phishing-shield/telemetry/events';
const MAX_BUFFER_EVENTS = 200;

let hydrated = false;
let hydrating: Promise<void> | null = null;
let buffer: TelemetryEventEnvelope[] = [];

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
        const parsed = JSON.parse(raw) as TelemetryEventEnvelope[];
        if (Array.isArray(parsed)) {
          buffer = parsed
            .filter((event) => Boolean(event?.name) && Boolean(event?.timestamp))
            .map((event) => ({
              ...event,
              timestamp: event.timestamp ?? new Date().toISOString(),
            }));
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[telemetry] Failed to hydrate adapter buffer', error);
      }
      buffer = [];
    } finally {
      hydrated = true;
      hydrating = null;
    }
  })();

  await hydrating;
};

const persist = async () => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch (error) {
    if (__DEV__) {
      console.warn('[telemetry] Failed to persist adapter buffer', error);
    }
  }
};

const persistentTelemetryAdapter: TelemetryAdapter = async (event, payload) => {
  await hydrate();

  const envelope: TelemetryEventEnvelope = {
    name: event,
    payload,
    timestamp: new Date().toISOString(),
  };

  buffer.push(envelope);
  if (buffer.length > MAX_BUFFER_EVENTS) {
    buffer.splice(0, buffer.length - MAX_BUFFER_EVENTS);
  }

  await persist();

  if (__DEV__) {
    const shortPayload = JSON.stringify(payload).slice(0, 160);
    console.info(`[telemetry] ${event} persisted`, shortPayload);
  }

  const outboxId = `${envelope.name}@${envelope.timestamp}`;

  enqueueOutboxEntry({
    channel: 'telemetry',
    payload: envelope,
    id: outboxId,
  })
    .then(() => flushOutbox())
    .catch((error) => {
      if (__DEV__) {
        console.warn('[telemetry] Failed to queue telemetry outbox entry', error);
      }
    });
};

export const initializeTelemetry = async () => {
  await hydrate();
  setTelemetryAdapter(persistentTelemetryAdapter);
};

export const getTelemetryBufferSnapshot = async () => {
  await hydrate();

  const latest = buffer[buffer.length - 1] ?? null;

  return {
    events: [...buffer],
    totalEvents: buffer.length,
    latestEventAt: latest?.timestamp ?? null,
  };
};

export const clearTelemetryBuffer = async () => {
  buffer = [];
  hydrated = true;
  await persist();
};
