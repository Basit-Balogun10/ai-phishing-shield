import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const ALERT_CHANNEL_ID = 'phishing-alerts';
let handlerConfigured = false;

export const configureNotificationHandling = () => {
  if (handlerConfigured) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
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
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      vibrate: [0, 250, 250, 250],
    },
    trigger: null,
  });
};
