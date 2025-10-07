import { Platform, PermissionsAndroid } from 'react-native';
import * as Notifications from 'expo-notifications';

export type PermissionRequestResult = {
  notificationsGranted: boolean;
  smsGranted: boolean;
};

const isNotificationGranted = (status: Notifications.NotificationPermissionsStatus): boolean => {
  return status.granted || status.status === Notifications.PermissionStatus.GRANTED;
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (isNotificationGranted(existing)) {
      return true;
    }

    const updated = await Notifications.requestPermissionsAsync();
    return isNotificationGranted(updated);
  } catch (error) {
    console.warn('[permissions] Failed to request notification permission', error);
    return false;
  }
};

export const requestSmsPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
      title: 'Allow AI Phishing Shield to read SMS messages',
      message: 'We analyze SMS content on-device to spot phishing attempts the moment they arrive.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
      buttonNeutral: 'Ask me later',
    });

    return status === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn('[permissions] Failed to request SMS permission', error);
    return false;
  }
};

export const requestAllRequiredPermissions = async (): Promise<PermissionRequestResult> => {
  const notificationsGranted = await requestNotificationPermission();
  const smsGranted = await requestSmsPermission();

  return { notificationsGranted, smsGranted };
};
