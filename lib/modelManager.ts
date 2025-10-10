import AsyncStorage from '@react-native-async-storage/async-storage';
import FileSystem, {
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
  deleteAsync,
} from 'expo-file-system';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

type ExpoFileSystemModule = typeof FileSystem & {
  documentDirectory?: string | null;
  cacheDirectory?: string | null;
};

const expoFs = FileSystem as ExpoFileSystemModule;

type Listener = () => void;

const MODEL_STATE_KEY = 'model_manager_state_v1';

export type ModelVersionMetadata = {
  version: string;
  releasedAt: string;
  sizeMB: number;
  checksum: string;
  changelog: string[];
  downloadUrl: string;
};

type InstalledModelRecord = ModelVersionMetadata & {
  installedAt: string;
  localPath: string;
  fileSizeBytes: number;
};

type PersistedModelState = {
  installed: InstalledModelRecord[];
  currentVersion: string | null;
  lastSyncedAt: string | null;
};

type OperationType = 'download' | 'activate' | 'sync' | 'remove';

type ModelManagerSnapshot = {
  ready: boolean;
  available: ModelVersionMetadata[];
  installed: InstalledModelRecord[];
  current: InstalledModelRecord | null;
  lastSyncedAt: string | null;
  status: 'idle' | 'syncing' | 'downloading';
  activeOperation: { type: OperationType; version: string } | null;
  error: string | null;
};

const MODEL_DIRECTORY_ROOT = expoFs.documentDirectory ?? expoFs.cacheDirectory;
if (!MODEL_DIRECTORY_ROOT) {
  throw new Error('[modelManager] No filesystem directory available for model storage');
}

const MODEL_DIRECTORY = `${MODEL_DIRECTORY_ROOT}models`;

const REMOTE_MODEL_REGISTRY: ModelVersionMetadata[] = [
  {
    version: 'v0.1.0',
    releasedAt: '2025-09-12T10:00:00Z',
    sizeMB: 14.2,
    checksum: 'sha256-b2106b9f',
    changelog: [
      'Initial public preview trained on 20k multilingual SMS samples.',
      'Optimized for latency on 1GB RAM devices.',
    ],
    downloadUrl: 'https://download.afrihackbox.dev/models/v0.1.0/phishing-detector.tflite',
  },
  {
    version: 'v0.2.0',
    releasedAt: '2025-09-28T09:30:00Z',
    sizeMB: 16.8,
    checksum: 'sha256-c88ab00e',
    changelog: [
      'Added Hausa, Pidgin, and Yoruba training corpora.',
      'Improved phishing intent recall by 7%.',
      'Reduced false positives for financial OTP messages.',
    ],
    downloadUrl: 'https://download.afrihackbox.dev/models/v0.2.0/phishing-detector.tflite',
  },
  {
    version: 'v0.3.0',
    releasedAt: '2025-10-06T07:45:00Z',
    sizeMB: 18.5,
    checksum: 'sha256-f32c9e12',
    changelog: [
      'Introduced WhatsApp notification embeddings.',
      'Expanded dataset with 12k human-reported scam transcripts.',
      'Lowered inference latency by 18% on Snapdragon 720G devices.',
    ],
    downloadUrl: 'https://download.afrihackbox.dev/models/v0.3.0/phishing-detector.tflite',
  },
];

let snapshot: ModelManagerSnapshot = {
  ready: false,
  available: REMOTE_MODEL_REGISTRY,
  installed: [],
  current: null,
  lastSyncedAt: null,
  status: 'idle',
  activeOperation: null,
  error: null,
};

const listeners = new Set<Listener>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const persistState = async (state: PersistedModelState) => {
  try {
    await AsyncStorage.setItem(MODEL_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[modelManager] Failed to persist state', error);
  }
};

const ensureModelDirectory = async () => {
  try {
    const info = await getInfoAsync(MODEL_DIRECTORY);
    if (!info.exists) {
      await makeDirectoryAsync(MODEL_DIRECTORY, { intermediates: true });
    }
  } catch (error) {
    console.warn('[modelManager] Failed to ensure model directory', error);
    throw error;
  }
};

const MODEL_PLACEHOLDER_TEMPLATE = (metadata: ModelVersionMetadata) =>
  JSON.stringify(
    {
      version: metadata.version,
      checksum: metadata.checksum,
      generatedAt: new Date().toISOString(),
    },
    null,
    2
  );

const writeModelPlaceholder = async (metadata: ModelVersionMetadata) => {
  await ensureModelDirectory();
  const filePath = `${MODEL_DIRECTORY}/${metadata.version.replace(/\./g, '_')}.tflite.json`;
  const payload = MODEL_PLACEHOLDER_TEMPLATE(metadata);

  await writeAsStringAsync(filePath, payload);

  const info = await getInfoAsync(filePath);

  return {
    path: filePath,
    sizeBytes: info.exists && typeof info.size === 'number' ? info.size : payload.length,
  };
};

const loadPersistedState = async (): Promise<PersistedModelState | null> => {
  try {
    const raw = await AsyncStorage.getItem(MODEL_STATE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const installedCandidates = Array.isArray(parsed.installed)
      ? (parsed.installed as InstalledModelRecord[])
      : [];

    const sanitizedInstalled: InstalledModelRecord[] = [];

    for (const entry of installedCandidates) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.version === 'string' &&
        typeof entry.installedAt === 'string' &&
        typeof entry.localPath === 'string'
      ) {
        const info = await getInfoAsync(entry.localPath);
        if (info.exists) {
          sanitizedInstalled.push({
            ...entry,
            fileSizeBytes:
              typeof entry.fileSizeBytes === 'number' ? entry.fileSizeBytes : (info.size ?? 0),
          });
        }
      }
    }

    return {
      installed: sanitizedInstalled,
      currentVersion: typeof parsed.currentVersion === 'string' ? parsed.currentVersion : null,
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
    } satisfies PersistedModelState;
  } catch (error) {
    console.warn('[modelManager] Failed to load persisted state', error);
    return null;
  }
};

const findMetadata = (version: string): ModelVersionMetadata | null => {
  const catalogMatch = snapshot.available.find((item) => item.version === version);
  if (catalogMatch) {
    return catalogMatch;
  }

  const installedMatch = snapshot.installed.find((item) => item.version === version);
  if (installedMatch) {
    const { installedAt, localPath, fileSizeBytes, ...metadata } = installedMatch;
    return metadata;
  }

  return null;
};

const ensureReady = async () => {
  if (snapshot.ready) {
    return;
  }

  const persisted = await loadPersistedState();
  if (persisted) {
    const installed = persisted.installed.map((record) => {
      const metadata = findMetadata(record.version);
      if (!metadata) {
        return record;
      }
      return {
        ...metadata,
        installedAt: record.installedAt,
        localPath: record.localPath,
        fileSizeBytes: record.fileSizeBytes,
      } satisfies InstalledModelRecord;
    });

    const current = installed.find((record) => record.version === persisted.currentVersion) ?? null;

    snapshot = {
      ...snapshot,
      installed,
      current,
      lastSyncedAt: persisted.lastSyncedAt,
      ready: true,
      status: 'idle',
      activeOperation: null,
      error: null,
    };
  } else {
    snapshot = {
      ...snapshot,
      ready: true,
      status: 'idle',
      activeOperation: null,
      error: null,
    };
  }

  emit();
};

const updateSnapshot = (updates: Partial<ModelManagerSnapshot>) => {
  snapshot = {
    ...snapshot,
    ...updates,
  } satisfies ModelManagerSnapshot;
  emit();
};

const simulateNetworkDelay = async () => {
  await new Promise((resolve) => setTimeout(resolve, 600));
};

const persistFromSnapshot = () => {
  const state: PersistedModelState = {
    installed: snapshot.installed,
    currentVersion: snapshot.current?.version ?? null,
    lastSyncedAt: snapshot.lastSyncedAt,
  };
  void persistState(state);
};

const modelManagerStore = {
  async initialize() {
    await ensureReady();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ModelManagerSnapshot {
    return snapshot;
  },
  async syncCatalog(): Promise<boolean> {
    await ensureReady();
    updateSnapshot({ status: 'syncing', activeOperation: { type: 'sync', version: 'registry' } });

    try {
      await simulateNetworkDelay();
      const mergedCatalog = REMOTE_MODEL_REGISTRY.map((entry) => ({ ...entry }));
      updateSnapshot({
        available: mergedCatalog,
        status: 'idle',
        activeOperation: null,
        lastSyncedAt: new Date().toISOString(),
        error: null,
      });
      persistFromSnapshot();
      return true;
    } catch (error) {
      console.warn('[modelManager] Failed to sync catalog', error);
      updateSnapshot({ status: 'idle', activeOperation: null, error: 'sync_failed' });
      return false;
    }
  },
  async installVersion(version: string) {
    await ensureReady();
    const metadata = findMetadata(version);
    if (!metadata) {
      throw new Error('Unknown model version');
    }

    updateSnapshot({
      status: 'downloading',
      activeOperation: { type: 'download', version },
      error: null,
    });

    try {
      await simulateNetworkDelay();
      const { path, sizeBytes } = await writeModelPlaceholder(metadata);

      const updatedRecord: InstalledModelRecord = {
        ...metadata,
        installedAt: new Date().toISOString(),
        localPath: path,
        fileSizeBytes: sizeBytes,
      };

      snapshot.installed = [
        updatedRecord,
        ...snapshot.installed.filter((item) => item.version !== version),
      ];

      updateSnapshot({
        current: updatedRecord,
        status: 'idle',
        activeOperation: null,
      });
      persistFromSnapshot();
      return updatedRecord;
    } catch (error) {
      console.warn('[modelManager] Failed to install model version', error);
      updateSnapshot({ status: 'idle', activeOperation: null, error: 'download_failed' });
      throw error;
    }
  },
  async activateVersion(version: string) {
    await ensureReady();
    const record = snapshot.installed.find((item) => item.version === version);
    if (!record) {
      throw new Error('Model version is not installed');
    }

    updateSnapshot({
      current: record,
      activeOperation: { type: 'activate', version },
    });

    persistFromSnapshot();
    updateSnapshot({ activeOperation: null });
  },
  async removeVersion(version: string) {
    await ensureReady();
    updateSnapshot({ activeOperation: { type: 'remove', version } });
    const record = snapshot.installed.find((item) => item.version === version);
    if (record) {
      try {
        await deleteAsync(record.localPath, { idempotent: true });
      } catch (error) {
        console.warn('[modelManager] Failed to delete model file', error);
      }
    }

    snapshot.installed = snapshot.installed.filter((item) => item.version !== version);
    if (snapshot.current?.version === version) {
      snapshot.current = snapshot.installed[0] ?? null;
    }
    updateSnapshot({ installed: snapshot.installed, current: snapshot.current });
    persistFromSnapshot();
    updateSnapshot({ activeOperation: null });
  },
};

export const useModelManager = () => {
  useEffect(() => {
    void modelManagerStore.initialize();
  }, []);

  const state = useSyncExternalStore(
    modelManagerStore.subscribe,
    modelManagerStore.getSnapshot,
    modelManagerStore.getSnapshot
  );

  return useMemo(
    () => ({
      ready: state.ready,
      available: state.available,
      installed: state.installed,
      current: state.current,
      lastSyncedAt: state.lastSyncedAt,
      status: state.status,
      activeOperation: state.activeOperation,
      error: state.error,
    }),
    [state]
  );
};

export const getActiveModelVersion = () => {
  return snapshot.current?.version ?? null;
};

export default modelManagerStore;
