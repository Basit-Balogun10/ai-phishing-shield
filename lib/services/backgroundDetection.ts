import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

import { explainDetection, runMockDetectionSweep } from '../detection/mockDetection';
import {
  ensureAlertNotificationChannelAsync,
  scheduleDetectionNotificationAsync,
} from '../notifications';

const TASK_NAME = 'mock-background-detection';
let taskDefined = false;

const defineDetectionTask = () => {
  if (taskDefined) {
    return;
  }

  TaskManager.defineTask(TASK_NAME, async () => {
    try {
      const result = await runMockDetectionSweep();

      if (result) {
        const notificationBody = explainDetection(result);
        await ensureAlertNotificationChannelAsync();
        await scheduleDetectionNotificationAsync(
          '⚠️ Phishing alert detected',
          notificationBody || 'Check the latest message flagged by AI Phishing Shield.'
        );
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }

      return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
      console.warn('[backgroundDetection] Task execution failed', error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });

  taskDefined = true;
};

export const initializeMockBackgroundDetectionAsync = async () => {
  defineDetectionTask();

  try {
    const registration = await BackgroundFetch.getStatusAsync();
    if (registration === BackgroundFetch.BackgroundFetchStatus.Restricted) {
      console.warn('[backgroundDetection] Background fetch is restricted on this device.');
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(TASK_NAME, {
        minimumInterval: 60 * 15,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch (error) {
    console.warn('[backgroundDetection] Failed to register background detection', error);
  }
};

export const triggerMockDetectionNow = async () => {
  defineDetectionTask();

  const result = await runMockDetectionSweep();

  if (!result) {
    return { triggered: false } as const;
  }

  await ensureAlertNotificationChannelAsync();
  const notificationBody = explainDetection(result);
  const notificationId = await scheduleDetectionNotificationAsync(
    '⚠️ Mock phishing alert',
    notificationBody || 'A suspicious message sample was flagged by the mock detector.'
  );

  return {
    triggered: true as const,
    notificationId,
    result,
  };
};
