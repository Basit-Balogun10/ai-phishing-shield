import { useEffect, useMemo, useSyncExternalStore } from 'react';

import {
  clearShieldStateInStorage,
  getShieldStateFromStorage,
  setShieldStateInStorage,
  type StoredShieldState,
} from './storage';

const DEFAULT_SHIELD_STATE: StoredShieldState = {
  paused: false,
  updatedAt: null,
};

type Listener = () => void;

type ShieldStateSnapshot = {
  ready: boolean;
  state: StoredShieldState;
};

let snapshot: ShieldStateSnapshot = {
  ready: false,
  state: DEFAULT_SHIELD_STATE,
};

const listeners = new Set<Listener>();
let hydrationPromise: Promise<void> | null = null;

const emit = () => {
  listeners.forEach((listener) => listener());
};

const hydrate = async () => {
  const stored = await getShieldStateFromStorage();
  snapshot = {
    ready: true,
    state: stored ?? DEFAULT_SHIELD_STATE,
  };
  emit();
};

const ensureHydrated = () => {
  if (!hydrationPromise) {
    hydrationPromise = hydrate().catch((error) => {
      console.warn('[shield] Failed to hydrate state', error);
      snapshot = {
        ready: true,
        state: DEFAULT_SHIELD_STATE,
      };
      emit();
    });
  }

  return hydrationPromise;
};

const persist = async (state: StoredShieldState) => {
  snapshot = {
    ready: true,
    state,
  };
  emit();

  await setShieldStateInStorage({
    paused: state.paused,
    updatedAt: new Date().toISOString(),
  });
};

const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => snapshot;

export const shieldStateStore = {
  initialize: ensureHydrated,
  subscribe,
  getSnapshot,
  async setPaused(paused: boolean) {
    await ensureHydrated();
    await persist({
      paused,
      updatedAt: new Date().toISOString(),
    });
  },
  async reset() {
    await persist({
      ...DEFAULT_SHIELD_STATE,
      updatedAt: new Date().toISOString(),
    });
  },
  async clear() {
    await clearShieldStateInStorage();
    snapshot = {
      ready: true,
      state: {
        ...DEFAULT_SHIELD_STATE,
        updatedAt: new Date().toISOString(),
      },
    };
    emit();
  },
};

export const useShieldState = () => {
  useEffect(() => {
    shieldStateStore.initialize();
  }, []);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => ({
      ready: state.ready,
      paused: state.state.paused,
      updatedAt: state.state.updatedAt,
    }),
    [state.ready, state.state.paused, state.state.updatedAt]
  );
};
