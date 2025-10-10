import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  clearTrustedSourcesInStorage,
  getTrustedSourcesFromStorage,
  setTrustedSourcesInStorage,
  type StoredTrustedSource,
} from './storage';

export type TrustedSource = StoredTrustedSource;

type TrustedSourcesSnapshot = {
  ready: boolean;
  sources: TrustedSource[];
};

type Listener = () => void;

type CreateTrustedSourceInput = {
  displayName: string;
  handle: string;
  channel: TrustedSource['channel'];
  note?: string;
};

const DEFAULT_TRUSTED_SOURCES: TrustedSource[] = [
  {
    id: 'trusted-uba-care',
    displayName: 'UBA Care Line',
    handle: 'UBA Secure',
    channel: 'sms',
    note: 'Official transactional alerts',
  },
  {
    id: 'trusted-whatsapp-support',
    displayName: 'WhatsApp Safety Team',
    handle: 'WhatsApp Support',
    channel: 'whatsapp',
  },
  {
    id: 'trusted-payroll',
    displayName: 'Internal HR Payroll',
    handle: 'HR Payroll',
    channel: 'email',
  },
];

const listeners = new Set<Listener>();
let snapshot: TrustedSourcesSnapshot = {
  ready: false,
  sources: [],
};
let hydrationPromise: Promise<void> | null = null;

const emit = () => {
  listeners.forEach((listener) => listener());
};

const normalize = (value: string) => value.trim().toLowerCase();

const loadTrustedSources = async () => {
  const stored = await getTrustedSourcesFromStorage();
  const sources = stored.length ? stored : DEFAULT_TRUSTED_SOURCES;

  if (!stored.length) {
    await setTrustedSourcesInStorage(sources);
  }

  snapshot = {
    ready: true,
    sources,
  };
  emit();
};

const ensureHydrated = () => {
  if (!hydrationPromise) {
    hydrationPromise = loadTrustedSources().catch((error) => {
      console.warn('[trustedSources] Failed to hydrate trusted sources', error);
      snapshot = {
        ready: true,
        sources: DEFAULT_TRUSTED_SOURCES,
      };
      emit();
    });
  }

  return hydrationPromise;
};

const getSnapshot = () => snapshot;

const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const persist = async (sources: TrustedSource[]) => {
  snapshot = {
    ready: true,
    sources,
  };
  emit();
  await setTrustedSourcesInStorage(sources);
};

const generateId = () =>
  `trusted-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const trustedSourcesStore = {
  initialize: ensureHydrated,
  getSnapshot,
  subscribe,
  async addSource(input: CreateTrustedSourceInput) {
    await ensureHydrated();
    const next: TrustedSource = {
      id: generateId(),
      displayName: input.displayName.trim() || input.handle.trim(),
      handle: input.handle.trim(),
      channel: input.channel,
      note: input.note?.trim() || undefined,
    };

    await persist([next, ...snapshot.sources]);
    return next;
  },
  async updateSource(
    id: string,
    updates: Partial<Omit<CreateTrustedSourceInput, 'channel'>> & {
      channel?: TrustedSource['channel'];
    }
  ) {
    await ensureHydrated();
    const nextSources = snapshot.sources.map((source) => {
      if (source.id !== id) {
        return source;
      }

      return {
        ...source,
        ...updates,
        displayName: updates.displayName?.trim() || updates.handle?.trim() || source.displayName,
        handle: updates.handle?.trim() ?? source.handle,
        note: updates.note?.trim() || undefined,
        channel: updates.channel ?? source.channel,
      } satisfies TrustedSource;
    });

    await persist(nextSources);
  },
  async removeSource(id: string) {
    await ensureHydrated();
    const nextSources = snapshot.sources.filter((source) => source.id !== id);
    await persist(nextSources);
  },
  async resetToDefaults() {
    await persist(DEFAULT_TRUSTED_SOURCES);
  },
  async clearAll() {
    snapshot = {
      ready: true,
      sources: [],
    };
    emit();
    await clearTrustedSourcesInStorage();
  },
};

export const useTrustedSources = () => {
  useEffect(() => {
    trustedSourcesStore.initialize();
  }, []);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => ({
      ready: state.ready,
      sources: state.sources,
    }),
    [state.ready, state.sources]
  );
};

export const isTrustedSender = (sender: string, channel: TrustedSource['channel']) => {
  const state = getSnapshot();
  if (!state.ready) {
    return false;
  }

  const normalizedSender = normalize(sender);
  return state.sources.some((source) => {
    return source.channel === channel && normalize(source.handle) === normalizedSender;
  });
};

export const getTrustedSourceForSender = (
  sender: string,
  channel: TrustedSource['channel']
): TrustedSource | undefined => {
  const normalizedSender = normalize(sender);
  return getSnapshot().sources.find((source) => {
    return source.channel === channel && normalize(source.handle) === normalizedSender;
  });
};

export const resolveTrustedSources = async (): Promise<TrustedSource[]> => {
  await ensureHydrated();
  return getSnapshot().sources;
};
