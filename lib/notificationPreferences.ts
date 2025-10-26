import { useEffect, useMemo, useSyncExternalStore } from 'react';

import {
  getNotificationPreferencesFromStorage,
  setNotificationPreferencesInStorage,
  type StoredNotificationPreferences,
} from './storage';

export type NotificationPreferences = StoredNotificationPreferences;

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  alertsEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

type NotificationPreferencesSnapshot = {
  ready: boolean;
  preferences: NotificationPreferences;
};

type Listener = () => void;

type UpdateInput = Partial<NotificationPreferences>;

let snapshot: NotificationPreferencesSnapshot = {
  ready: false,
  preferences: DEFAULT_NOTIFICATION_PREFERENCES,
};

const listeners = new Set<Listener>();
let hydrationPromise: Promise<void> | null = null;

const emit = () => {
  listeners.forEach((listener) => listener());
};

const loadPreferences = async () => {
  const stored = await getNotificationPreferencesFromStorage();

  snapshot = {
    ready: true,
    preferences: stored ?? DEFAULT_NOTIFICATION_PREFERENCES,
  };
  emit();
};

const ensureHydrated = () => {
  if (!hydrationPromise) {
    hydrationPromise = loadPreferences().catch((error) => {
      console.warn('[notifications] Failed to hydrate notification preferences', error);
      snapshot = {
        ready: true,
        preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      };
      emit();
    });
  }

  return hydrationPromise;
};

const persist = async (preferences: NotificationPreferences) => {
  snapshot = {
    ready: true,
    preferences,
  };
  emit();
  await setNotificationPreferencesInStorage(preferences);
};

const getSnapshot = () => snapshot;

const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const notificationPreferencesStore = {
  initialize: ensureHydrated,
  getSnapshot,
  subscribe,
  async updatePreferences(updates: UpdateInput) {
    await ensureHydrated();
    await persist({
      ...snapshot.preferences,
      ...updates,
    });
  },
  async resetPreferences() {
    await persist(DEFAULT_NOTIFICATION_PREFERENCES);
  },
};

export const useNotificationPreferences = () => {
  useEffect(() => {
    notificationPreferencesStore.initialize();
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
