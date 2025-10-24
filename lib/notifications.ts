import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import {
  notificationPreferencesStore,
  type NotificationPreferences,
} from './notificationPreferences';

const ALERT_CHANNEL_ID = 'phishing-alerts';
let handlerConfigured = false;

const parseTimeToMinutes = (value: string): number => {
  const [hoursString, minutesString] = value.split(':');
  const hours = Number.parseInt(hoursString ?? '0', 10);
  const minutes = Number.parseInt(minutesString ?? '0', 10);
  const normalizedHours = Number.isNaN(hours) ? 0 : Math.min(Math.max(hours, 0), 23);
  const normalizedMinutes = Number.isNaN(minutes) ? 0 : Math.min(Math.max(minutes, 0), 59);
  return normalizedHours * 60 + normalizedMinutes;
};

const isWithinQuietHours = (preferences: NotificationPreferences): boolean => {
  if (!preferences.quietHoursEnabled) {
    return false;
  }

  const start = parseTimeToMinutes(preferences.quietHoursStart);
  const end = parseTimeToMinutes(preferences.quietHoursEnd);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (start === end) {
    return false;
  }

  if (start < end) {
    return currentMinutes >= start && currentMinutes < end;
  }

  return currentMinutes >= start || currentMinutes < end;
};

export const isQuietHoursActive = (preferences: NotificationPreferences): boolean =>
  isWithinQuietHours(preferences);

export const configureNotificationHandling = () => {
  if (handlerConfigured) {
    return;
  }

  notificationPreferencesStore.initialize();

  Notifications.setNotificationHandler({
    handleNotification: async () => {
      await notificationPreferencesStore.initialize();
      const { preferences } = notificationPreferencesStore.getSnapshot();
      const quietHoursActive = isWithinQuietHours(preferences);
      const shouldShowAlert = preferences.alertsEnabled;
      const shouldPlaySound = shouldShowAlert && preferences.soundEnabled && !quietHoursActive;

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
  const quietHoursActive = isWithinQuietHours(preferences);
  const shouldPlaySound = preferences.soundEnabled && !quietHoursActive;
  const shouldVibrate = preferences.vibrationEnabled && !quietHoursActive;

  if (!preferences.alertsEnabled) {
    console.warn('[notifications] Suppressing alert because user disabled phishing alerts.');
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
