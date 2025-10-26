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

// SMS permission removed: this app no longer requests or checks SMS runtime permission.

export const openSystemSettings = async (): Promise<void> => {
  try {
    await Linking.openSettings();
  } catch (error) {
    console.warn('[permissions] Failed to open system settings', error);
  }
};

export const requestAllRequiredPermissions = async (): Promise<PermissionRequestResult> => {
  const notifications = await requestNotificationPermission();

  return { notifications };
};
