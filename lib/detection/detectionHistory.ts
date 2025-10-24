import { useMemo, useSyncExternalStore } from 'react';

import { analyzeMessage, getMockMessages, type DetectionResult } from './mockDetection';

type DetectionSource = 'historical' | 'simulated';

export type DetectionRecord = {
  recordId: string;
  result: DetectionResult;
  detectedAt: string;
  source: DetectionSource;
};

type DetectionHistorySnapshot = {
  historical: DetectionRecord[];
  simulated: DetectionRecord[];
  merged: DetectionRecord[];
  lastSimulated: DetectionRecord | null;
};

const listeners = new Set<() => void>();

const buildHistoricalDetections = (): DetectionRecord[] => {
  return getMockMessages()
    .map((message) => {
      const result = analyzeMessage(message);
      return {
        recordId: message.id,
        result,
        detectedAt: message.receivedAt,
        source: 'historical' as const,
      } satisfies DetectionRecord;
    })
    .filter((record) => record.result.score >= 0.6)
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
};

const historicalDetections = buildHistoricalDetections();

let simulatedDetections: DetectionRecord[] = [];
let lastSimulatedId: string | null = null;

const sortDetections = (records: DetectionRecord[]): DetectionRecord[] => {
  return [...records].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );
};

const buildSnapshot = (): DetectionHistorySnapshot => {
  const mergedMap = new Map<string, DetectionRecord>();

  for (const record of simulatedDetections) {
    mergedMap.set(record.recordId, record);
  }

  for (const record of historicalDetections) {
    if (!mergedMap.has(record.recordId)) {
      mergedMap.set(record.recordId, record);
    }
  }

  const merged = sortDetections(Array.from(mergedMap.values()));

  return {
    historical: historicalDetections,
    simulated: simulatedDetections,
    merged,
    lastSimulated: simulatedDetections[0] ?? null,
  };
};

let currentSnapshot: DetectionHistorySnapshot = buildSnapshot();

const refreshSnapshot = () => {
  currentSnapshot = buildSnapshot();
};

const emit = () => {
  refreshSnapshot();
  listeners.forEach((listener) => listener());
};

const getSnapshot = () => currentSnapshot;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const detectionHistoryStore = {
  addSimulatedDetection(record: DetectionRecord) {
    simulatedDetections = [
      record,
      ...simulatedDetections.filter((item) => item.recordId !== record.recordId),
    ];
    lastSimulatedId = record.recordId;
    emit();
  },
  removeSimulatedDetection(recordId: string) {
    simulatedDetections = simulatedDetections.filter((record) => record.recordId !== recordId);
    if (lastSimulatedId === recordId) {
      lastSimulatedId = simulatedDetections[0]?.recordId ?? null;
    }
    emit();
  },
  clearSimulatedDetections() {
    simulatedDetections = [];
    lastSimulatedId = null;
    emit();
  },
  getSnapshot,
  subscribe,
};

export const useDetectionHistory = () => {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => ({
      merged: snapshot.merged,
      historical: snapshot.historical,
      simulated: snapshot.simulated,
      lastSimulated: snapshot.lastSimulated,
    }),
    [snapshot]
  );
};

export const getLatestSimulatedDetection = () => {
  const snapshot = getSnapshot();
  return snapshot.lastSimulated;
};

export const getSimulatedDetections = () => {
  const snapshot = getSnapshot();
  return snapshot.simulated;
};

export const addSimulatedDetection = (record: DetectionRecord) => {
  detectionHistoryStore.addSimulatedDetection(record);
};

export const removeSimulatedDetection = (recordId: string) => {
  detectionHistoryStore.removeSimulatedDetection(recordId);
};

export const clearSimulatedDetections = () => {
  detectionHistoryStore.clearSimulatedDetections();
};
