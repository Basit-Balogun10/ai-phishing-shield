import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';

import { explainDetection, runMockDetectionSweep } from '../detection/mockDetection';
import {
  ensureAlertNotificationChannelAsync,
  scheduleDetectionNotificationAsync,
} from '../notifications';
import { checkNotificationPermission } from '../permissions';
import { trackTelemetryEvent } from './telemetry';

const { BackgroundTaskResult, BackgroundTaskStatus } = BackgroundTask;

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
        return BackgroundTaskResult.Success;
      }

      return BackgroundTaskResult.Success;
    } catch (error) {
      console.warn('[backgroundDetection] Task execution failed', error);
      return BackgroundTaskResult.Failed;
    }
  });

  taskDefined = true;
};

export const initializeMockBackgroundDetectionAsync = async () => {
  defineDetectionTask();

  try {
    const notificationStatus = await checkNotificationPermission();

    const permissionsGranted = notificationStatus.granted;

    if (!permissionsGranted) {
      console.warn(
        '[backgroundDetection] Skipping background registration because required permissions are missing.'
      );
      trackTelemetryEvent('background.detection_registration', {
        status: 'skipped',
        reason: 'missing_permissions',
      });
      return;
    }

    if (Constants.appOwnership === 'expo') {
      console.warn(
        '[backgroundDetection] Background tasks are unavailable in Expo Go. Skipping registration.'
      );
      trackTelemetryEvent('background.detection_registration', {
        status: 'skipped',
        reason: 'expo_go',
      });
      return;
    }

    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTaskStatus.Restricted) {
      console.warn('[backgroundDetection] Background tasks are restricted on this device.');
      trackTelemetryEvent('background.detection_registration', {
        status: 'skipped',
        reason: 'restricted',
      });
      return;
    }
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(TASK_NAME, {
        minimumInterval: 60 * 15,
      });
      trackTelemetryEvent('background.detection_registration', {
        status: 'registered',
      });
    } else {
      trackTelemetryEvent('background.detection_registration', {
        status: 'registered',
        reason: 'already_registered',
      });
    }
  } catch (error) {
    console.warn('[backgroundDetection] Failed to register background detection', error);
    trackTelemetryEvent('background.detection_registration', {
      status: 'skipped',
      reason: 'error',
    });
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
