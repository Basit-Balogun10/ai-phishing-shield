import { useEffect, useMemo, useSyncExternalStore } from 'react';

import {
  clearTelemetryPreferencesInStorage,
  getTelemetryPreferencesFromStorage,
  setTelemetryPreferencesInStorage,
  type StoredTelemetryPreferences,
} from './storage';

export type TelemetryPreferences = StoredTelemetryPreferences;

const DEFAULT_TELEMETRY_PREFERENCES: TelemetryPreferences = {
  autoUploadEnabled: false,
  allowManualReports: true,
  lastUpdatedAt: null,
};

type Listener = () => void;

type TelemetryPreferenceSnapshot = {
  ready: boolean;
  preferences: TelemetryPreferences;
};

type UpdateInput = Partial<Omit<TelemetryPreferences, 'lastUpdatedAt'>>;

let snapshot: TelemetryPreferenceSnapshot = {
  ready: false,
  preferences: DEFAULT_TELEMETRY_PREFERENCES,
};

const listeners = new Set<Listener>();
let hydrationPromise: Promise<void> | null = null;

const emit = () => {
  listeners.forEach((listener) => listener());
};

const loadTelemetryPreferences = async () => {
  const stored = await getTelemetryPreferencesFromStorage();

  snapshot = {
    ready: true,
    preferences: stored ?? DEFAULT_TELEMETRY_PREFERENCES,
  };
  emit();
};

const ensureHydrated = () => {
  if (!hydrationPromise) {
    hydrationPromise = loadTelemetryPreferences().catch((error) => {
      console.warn('[telemetry] Failed to hydrate preferences', error);
      snapshot = {
        ready: true,
        preferences: DEFAULT_TELEMETRY_PREFERENCES,
      };
      emit();
    });
  }

  return hydrationPromise;
};

const persist = async (preferences: TelemetryPreferences) => {
  snapshot = {
    ready: true,
    preferences,
  };
  emit();

  await setTelemetryPreferencesInStorage({
    ...preferences,
    lastUpdatedAt: new Date().toISOString(),
  });
};

const getSnapshot = () => snapshot;

const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const telemetryPreferencesStore = {
  initialize: ensureHydrated,
  getSnapshot,
  subscribe,
  async updatePreferences(updates: UpdateInput) {
    await ensureHydrated();
    await persist({
      ...snapshot.preferences,
      ...updates,
      lastUpdatedAt: new Date().toISOString(),
    });
  },
  async resetPreferences() {
    await persist({
      ...DEFAULT_TELEMETRY_PREFERENCES,
      lastUpdatedAt: new Date().toISOString(),
    });
  },
  async clear() {
    await clearTelemetryPreferencesInStorage();
    snapshot = {
      ready: true,
      preferences: DEFAULT_TELEMETRY_PREFERENCES,
    };
    emit();
  },
};

export const useTelemetryPreferences = () => {
  useEffect(() => {
    telemetryPreferencesStore.initialize();
  }, []);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => ({
      ready: state.ready,
      preferences: state.preferences,
    }),
    [state.preferences, state.ready]
  );
};
