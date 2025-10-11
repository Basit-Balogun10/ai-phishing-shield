import { Linking, PermissionsAndroid, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export type PermissionStatus = {
  granted: boolean;
  canAskAgain: boolean;
  blocked: boolean;
  unavailable?: boolean;
};

export type PermissionRequestResult = {
  notifications: PermissionStatus;
  sms: PermissionStatus;
};

const isNotificationGranted = (status: Notifications.NotificationPermissionsStatus): boolean => {
  return status.granted || status.status === Notifications.PermissionStatus.GRANTED;
};

const mapNotificationStatus = (
  status: Notifications.NotificationPermissionsStatus
): PermissionStatus => ({
  granted: isNotificationGranted(status),
  canAskAgain: status.canAskAgain ?? false,
  blocked: !isNotificationGranted(status) && !(status.canAskAgain ?? false),
});

export const checkNotificationPermission = async (): Promise<PermissionStatus> => {
  try {
    const existing = await Notifications.getPermissionsAsync();
    return mapNotificationStatus(existing);
  } catch (error) {
    console.warn('[permissions] Failed to request notification permission', error);
    return { granted: false, blocked: false, canAskAgain: true };
  }
};

export const requestNotificationPermission = async (): Promise<PermissionStatus> => {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (isNotificationGranted(existing)) {
      return mapNotificationStatus(existing);
    }

    if (!(existing.canAskAgain ?? false)) {
      return mapNotificationStatus(existing);
    }

    const updated = await Notifications.requestPermissionsAsync();
    return mapNotificationStatus(updated);
  } catch (error) {
    console.warn('[permissions] Failed to request notification permission', error);
    return { granted: false, blocked: false, canAskAgain: true };
  }
};

type AndroidPermissionResult = 'granted' | 'denied' | 'never_ask_again' | 'blocked';

const mapSmsStatus = (result: AndroidPermissionResult): PermissionStatus => {
  switch (result) {
    case 'granted':
      return { granted: true, canAskAgain: true, blocked: false };
    case 'denied':
      return { granted: false, canAskAgain: true, blocked: false };
    case 'never_ask_again':
      return { granted: false, canAskAgain: false, blocked: true };
    default:
      return { granted: false, canAskAgain: true, blocked: false };
  }
};

export const checkSmsPermission = async (): Promise<PermissionStatus> => {
  if (Platform.OS !== 'android') {
    return { granted: true, canAskAgain: false, blocked: false, unavailable: true };
  }

  try {
    const status = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    if (status) {
      return { granted: true, canAskAgain: true, blocked: false };
    }
    return { granted: false, canAskAgain: true, blocked: false };
  } catch (error) {
    console.warn('[permissions] Failed to request SMS permission', error);
    return { granted: false, canAskAgain: true, blocked: false };
  }
};

export const requestSmsPermission = async (): Promise<PermissionStatus> => {
  if (Platform.OS !== 'android') {
    return { granted: true, canAskAgain: false, blocked: false, unavailable: true };
  }

  try {
    const result = (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
      title: 'Allow AI Phishing Shield to read SMS messages',
      message: 'We analyze SMS content on-device to spot phishing attempts the moment they arrive.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
      buttonNeutral: 'Ask me later',
    })) as AndroidPermissionResult;

    return mapSmsStatus(result);
  } catch (error) {
    console.warn('[permissions] Failed to request SMS permission', error);
    return { granted: false, canAskAgain: true, blocked: false };
  }
};

export const openSystemSettings = async (): Promise<void> => {
  try {
    await Linking.openSettings();
  } catch (error) {
    console.warn('[permissions] Failed to open system settings', error);
  }
};

export const requestAllRequiredPermissions = async (): Promise<PermissionRequestResult> => {
  const notifications = await requestNotificationPermission();
  const sms = await requestSmsPermission();

  return { notifications, sms };
};
