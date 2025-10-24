import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import {
  notificationPreferencesStore,
  type NotificationPreferences,
} from './notificationPreferences';

const ALERT_CHANNEL_ID = 'phishing-alerts';
let handlerConfigured = false;

// Quiet-hours feature removed: always treat as not active.

export const configureNotificationHandling = () => {
  if (handlerConfigured) {
    return;
  }

  notificationPreferencesStore.initialize();

  Notifications.setNotificationHandler({
    handleNotification: async () => {
      await notificationPreferencesStore.initialize();
      const { preferences } = notificationPreferencesStore.getSnapshot();
  const shouldShowAlert = preferences.alertsEnabled;
  const shouldPlaySound = shouldShowAlert && preferences.soundEnabled;

      return {
        shouldShowAlert,
        shouldPlaySound,
        shouldSetBadge: false,
        shouldShowBanner: shouldShowAlert,
        shouldShowList: shouldShowAlert,
      } satisfies Notifications.NotificationBehavior;
    },
  });

  handlerConfigured = true;
};

export const ensureAlertNotificationChannelAsync = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  const existing = await Notifications.getNotificationChannelAsync(ALERT_CHANNEL_ID);
  if (existing) {
    return;
  }

  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
    name: 'Phishing Alerts',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    enableLights: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
};

export const scheduleDetectionNotificationAsync = async (
  title: string,
  body: string
): Promise<string> => {
  await notificationPreferencesStore.initialize();
  const { preferences } = notificationPreferencesStore.getSnapshot();
  const shouldPlaySound = preferences.soundEnabled;
  const shouldVibrate = preferences.vibrationEnabled;
  if (!preferences.alertsEnabled) {
    console.warn('[notifications] Suppressing alert because user disabled phishing alerts.');
    // Respect the master toggle by not scheduling a local notification when alerts are disabled.
    return Promise.resolve('');
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: shouldPlaySound ? 'default' : undefined,
      vibrate: shouldVibrate ? [0, 250, 250, 250] : undefined,
    },
    trigger: null,
  });
};
