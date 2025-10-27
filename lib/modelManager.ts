import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import { NativeModules } from 'react-native';
import * as modelNative from './services/modelNative';
import * as Crypto from 'expo-crypto';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

type ExpoFileSystemModule = typeof FileSystem & {
  documentDirectory?: string | null;
  cacheDirectory?: string | null;
};

const expoFs = FileSystem as ExpoFileSystemModule;
const {
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
  deleteAsync,
  createDownloadResumable,
} = expoFs;

type Listener = () => void;

const MODEL_STATE_KEY = 'model_manager_state_v1';

export type ModelVersionMetadata = {
  version: string;
  releasedAt: string;
  sizeMB: number;
  checksum: string;
  changelog: string[];
  downloadUrl: string;
  // optional additional artifacts hosted alongside the model (recommended)
  tokenizerUrl?: string;
  metadataUrl?: string;
};

type InstalledModelRecord = ModelVersionMetadata & {
  installedAt: string;
  localPath: string;
  fileSizeBytes: number;
};

type CatalogMode = 'live' | 'dummy';

type PersistedModelState = {
  installed: InstalledModelRecord[];
  currentVersion: string | null;
  lastSyncedAt: string | null;
  catalogMode: CatalogMode;
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
  catalogMode: CatalogMode;
  downloadProgress: number | null;
  isOfflineFallback: boolean;
};

const MODEL_DIRECTORY_ROOT = expoFs.documentDirectory ?? expoFs.cacheDirectory ?? null;
const FILESYSTEM_AVAILABLE =
  typeof MODEL_DIRECTORY_ROOT === 'string' && MODEL_DIRECTORY_ROOT.length > 0;
const MODEL_DIRECTORY = FILESYSTEM_AVAILABLE ? `${MODEL_DIRECTORY_ROOT}models` : null;
const MEMORY_PLACEHOLDER_PREFIX = 'model_manager_memory_placeholder_v1_';

const DEFAULT_REGISTRY_URL = 'https://ai-phishing-shield.onrender.com/models/catalog.json';

const resolveRegistryUrl = () => {
  // Prefer EAS / runtime env EXPO_PUBLIC_MODEL_CATALOG_URL, then check expo config extras
  try {
    // process.env may be populated in some build environments
    if (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_MODEL_CATALOG_URL) {
      return String(process.env.EXPO_PUBLIC_MODEL_CATALOG_URL);
    }
  } catch (e) {
    // ignore
  }

  // Constants.expoConfig?.extra is commonly where extras land
  const extras = (Constants as any).expoConfig?.extra || (Constants as any).manifest?.extra;
  if (extras) {
    if (typeof extras.EXPO_PUBLIC_MODEL_CATALOG_URL === 'string' && extras.EXPO_PUBLIC_MODEL_CATALOG_URL.length > 0) {
      return extras.EXPO_PUBLIC_MODEL_CATALOG_URL;
    }
    if (typeof extras.modelRegistryUrl === 'string' && extras.modelRegistryUrl.length > 0) {
      return extras.modelRegistryUrl;
    }
  }

  return DEFAULT_REGISTRY_URL;
};

const isMemoryPath = (path: string) => path.startsWith('memory://');

// NOTE: registry entries are served from the remote server (EXPO_PUBLIC_MODEL_CATALOG_URL).
// We intentionally do not keep an embedded/dummy registry here — the app will show an
// empty catalog when offline so the UI can render a clear placeholder.

let snapshot: ModelManagerSnapshot = {
  ready: false,
  available: [],
  installed: [],
  current: null,
  lastSyncedAt: null,
  status: 'idle',
  activeOperation: null,
  error: null,
  catalogMode: 'live',
  downloadProgress: null,
  isOfflineFallback: false,
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
  if (!FILESYSTEM_AVAILABLE || !MODEL_DIRECTORY) {
    return false;
  }

  try {
    const info = await getInfoAsync(MODEL_DIRECTORY);
    if (!info.exists) {
      await makeDirectoryAsync(MODEL_DIRECTORY, { intermediates: true });
    }
    return true;
  } catch (error) {
    console.warn('[modelManager] Failed to ensure model directory', error);
    return false;
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
  const payload = MODEL_PLACEHOLDER_TEMPLATE(metadata);

  if (!FILESYSTEM_AVAILABLE || !MODEL_DIRECTORY) {
    await AsyncStorage.setItem(`${MEMORY_PLACEHOLDER_PREFIX}${metadata.version}`, payload);
    return {
      path: `memory://${metadata.version}`,
      sizeBytes: payload.length,
    };
  }

  await ensureModelDirectory();
  const filePath = `${MODEL_DIRECTORY}/${metadata.version.replace(/\./g, '_')}.tflite.json`;

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
        const baseRecord: InstalledModelRecord = {
          ...entry,
          fileSizeBytes: typeof entry.fileSizeBytes === 'number' ? entry.fileSizeBytes : 0,
        };

        if (isMemoryPath(entry.localPath)) {
          const memoryPayload = await AsyncStorage.getItem(
            `${MEMORY_PLACEHOLDER_PREFIX}${entry.version}`
          );
          if (memoryPayload) {
            sanitizedInstalled.push({
              ...baseRecord,
              fileSizeBytes: memoryPayload.length,
            });
          }
          continue;
        }

        if (!FILESYSTEM_AVAILABLE) {
          sanitizedInstalled.push(baseRecord);
          continue;
        }

        try {
          const info = await getInfoAsync(entry.localPath);
          if (info.exists) {
            sanitizedInstalled.push({
              ...baseRecord,
              fileSizeBytes:
                typeof baseRecord.fileSizeBytes === 'number'
                  ? baseRecord.fileSizeBytes
                  : (info.size ?? 0),
            });
          }
        } catch (fsError) {
          console.warn('[modelManager] Failed to validate installed model file', fsError);
        }
      }
    }

    return {
      installed: sanitizedInstalled,
      currentVersion: typeof parsed.currentVersion === 'string' ? parsed.currentVersion : null,
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
      catalogMode: parsed.catalogMode === 'dummy' ? 'dummy' : 'live',
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
      catalogMode: persisted.catalogMode,
    };
  } else {
    snapshot = {
      ...snapshot,
      ready: true,
      status: 'idle',
      activeOperation: null,
      error: null,
      catalogMode: 'live',
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

const persistFromSnapshot = () => {
  const state: PersistedModelState = {
    installed: snapshot.installed,
    currentVersion: snapshot.current?.version ?? null,
    lastSyncedAt: snapshot.lastSyncedAt,
    catalogMode: snapshot.catalogMode,
  };
  void persistState(state);
};

const fetchRemoteCatalog = async (): Promise<ModelVersionMetadata[]> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(resolveRegistryUrl(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Unexpected status: ${response.status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Invalid payload shape');
    }

    return payload.map(
      (entry) =>
        ({
          version: String(entry.version),
          releasedAt:
            typeof entry.releasedAt === 'string' ? entry.releasedAt : new Date().toISOString(),
          sizeMB: Number(entry.sizeMB) || 0,
          checksum: typeof entry.checksum === 'string' ? entry.checksum : 'unknown',
          changelog: Array.isArray(entry.changelog)
            ? entry.changelog.map((item: unknown) => String(item))
            : [],
          downloadUrl: typeof entry.downloadUrl === 'string' ? entry.downloadUrl : '',
        }) satisfies ModelVersionMetadata
    );
  } finally {
    clearTimeout(timeout);
  }
};

const ensureCatalog = async (_mode: CatalogMode) => {
  try {
    const remoteCatalog = await fetchRemoteCatalog();
    updateSnapshot({
      available: remoteCatalog,
      isOfflineFallback: false,
    });
    return true;
  } catch (error) {
    console.warn('[modelManager] Failed to fetch remote catalog, offline - showing placeholder', error);
    // When offline, show an empty catalog so UI renders the placeholder copy
    updateSnapshot({
      available: [],
      isOfflineFallback: true,
    });
    return false;
  }
};

const resetDownloadProgress = () => {
  updateSnapshot({ downloadProgress: null });
};

const downloadModelBinary = async (metadata: ModelVersionMetadata) => {
  if (!metadata.downloadUrl) {
    return writeModelPlaceholder(metadata);
  }

  if (!FILESYSTEM_AVAILABLE || !MODEL_DIRECTORY || !createDownloadResumable) {
    return writeModelPlaceholder(metadata);
  }

  await ensureModelDirectory();
  const extension = metadata.downloadUrl.split('.').pop()?.split('?')[0] ?? 'tflite';
  const filePath = `${MODEL_DIRECTORY}/${metadata.version.replace(/\./g, '_')}.${extension}`;

  const downloadResumable = createDownloadResumable(
    metadata.downloadUrl,
    filePath,
    {},
    (progress) => {
      if (progress.totalBytesExpectedToWrite) {
        const ratio = progress.totalBytesWritten / Math.max(progress.totalBytesExpectedToWrite, 1);
        updateSnapshot({ downloadProgress: Math.min(Math.max(ratio, 0), 1) });
      }
    }
  );

  try {
    const result = await downloadResumable.downloadAsync();
    if (!result) {
      throw new Error('Download cancelled');
    }

    const info = await getInfoAsync(filePath);
    const sizeBytes =
      'size' in info && typeof info.size === 'number' ? info.size : (result.totalBytesWritten ?? 0);

    // Best-effort checksum verification (expects metadata.checksum like 'sha256-<hex>')
    try {
      if (metadata.checksum && metadata.checksum.startsWith('sha256-')) {
        const expectedHex = metadata.checksum.replace(/^sha256-/, '');
        try {
          const base64 = await FileSystem.readAsStringAsync(filePath, { encoding: 'base64' });
          // digestStringAsync will produce hex by default for SHA256
          const actualHex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
          if (actualHex !== expectedHex) {
            throw new Error(`checksum_mismatch actual=${actualHex} expected=${expectedHex}`);
          }
        } catch (hashErr) {
          // If checksum verification fails, remove the file and surface an error
          try {
            await deleteAsync(filePath, { idempotent: true });
          } catch {}
          throw hashErr;
        }
      }
    } catch (err) {
      // rethrow so caller can handle. resetDownloadProgress handled below.
      throw err;
    }

    return {
      path: filePath,
      sizeBytes,
    };
  } catch (error) {
    resetDownloadProgress();
    try {
      await deleteAsync(filePath, { idempotent: true });
    } catch {
      // noop
    }
    throw error;
  } finally {
    resetDownloadProgress();
  }
};

const modelManagerStore = {
  async initialize() {
    await ensureReady();
    await ensureCatalog(snapshot.catalogMode);
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ModelManagerSnapshot {
    return snapshot;
  },
  async syncCatalog(modeOverride?: CatalogMode): Promise<boolean> {
    await ensureReady();
    const mode = modeOverride ?? snapshot.catalogMode;

    updateSnapshot({
      status: 'syncing',
      activeOperation: { type: 'sync', version: 'registry' },
      error: null,
    });

    try {
      const success = await ensureCatalog(mode);
      if (!success && mode === 'live') {
        updateSnapshot({
          status: 'idle',
          activeOperation: null,
          lastSyncedAt: new Date().toISOString(),
        });
        persistFromSnapshot();
        return false;
      }

      updateSnapshot({
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
  async setCatalogMode(mode: CatalogMode) {
    await ensureReady();
    if (snapshot.catalogMode === mode) {
      return;
    }

    updateSnapshot({ catalogMode: mode });
    persistFromSnapshot();
    await modelManagerStore.syncCatalog(mode);
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
      const { path, sizeBytes } =
        snapshot.catalogMode === 'live'
          ? await downloadModelBinary(metadata)
          : await writeModelPlaceholder(metadata);

      // If tokenizerUrl is present, try to download and extract it to a versioned folder
      let tokenizerLocalPath: string | null = null;
      if (metadata.tokenizerUrl && MODEL_DIRECTORY) {
        try {
          const tokenizerZipPath = `${MODEL_DIRECTORY}/${metadata.version.replace(/\./g, '_')}_tokenizer.zip`;
          const tokenizerDest = `${MODEL_DIRECTORY}/${metadata.version.replace(/\./g, '_')}_tokenizer`;
          try {
            // download tokenizer asset
            await ensureModelDirectory();
            const tokRes = await createDownloadResumable(
              metadata.tokenizerUrl,
              tokenizerZipPath,
              {},
              (progress) => {
                // no-op: don't override downloadProgress; this is separate
              }
            ).downloadAsync();

            // Try to unzip using optional native helper 'react-native-zip-archive' if available
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const { unzip } = require('react-native-zip-archive');
              await unzip(tokenizerZipPath, tokenizerDest);
              tokenizerLocalPath = tokenizerDest;
            } catch (e) {
              // could not unzip (module missing) — fallback: leave zip as-is and log
              console.warn('[modelManager] unzip not available or failed', e);
              // as a fallback, keep the zip file path so native code could potentially handle it
              tokenizerLocalPath = tokenizerZipPath;
            }
          } catch (tokErr) {
            console.warn('[modelManager] Failed to download or extract tokenizer', tokErr);
            tokenizerLocalPath = null;
          }
        } catch (e) {
          // ignore tokenizer failures
          tokenizerLocalPath = null;
        }
      }

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

      // Attempt to notify native inference module (via wrapper) to activate the newly installed model
      try {
        const tokenizerArg = tokenizerLocalPath ?? null;
        let metadataLocalPath: string | null = null;
        if (metadata.metadataUrl && MODEL_DIRECTORY) {
          // attempt to fetch metadata to a local file so native can read it
          try {
            const metaPath = `${MODEL_DIRECTORY}/${metadata.version.replace(/\./g, '_')}_metadata.json`;
            await createDownloadResumable(metadata.metadataUrl, metaPath).downloadAsync();
            metadataLocalPath = metaPath;
          } catch (e) {
            metadataLocalPath = null;
          }
        }

        try {
          await modelNative.activateModel(path, tokenizerArg, metadataLocalPath);
        } catch (nativeErr) {
          console.warn('[modelManager] native activateModel failed', nativeErr);
        }
      } catch (e) {
        // ignore native activation errors
      }
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
      if (isMemoryPath(record.localPath)) {
        await AsyncStorage.removeItem(`${MEMORY_PLACEHOLDER_PREFIX}${record.version}`);
      } else if (FILESYSTEM_AVAILABLE) {
        try {
          await deleteAsync(record.localPath, { idempotent: true });
        } catch (error) {
          console.warn('[modelManager] Failed to delete model file', error);
        }
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
      catalogMode: state.catalogMode,
      downloadProgress: state.downloadProgress,
      isOfflineFallback: state.isOfflineFallback,
      setCatalogMode: modelManagerStore.setCatalogMode,
      syncCatalog: modelManagerStore.syncCatalog,
    }),
    [state]
  );
};

export const getActiveModelVersion = () => {
  return snapshot.current?.version ?? null;
};

export default modelManagerStore;
