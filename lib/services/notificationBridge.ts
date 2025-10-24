import { NativeModules, NativeEventEmitter } from 'react-native';

const { NotificationBridge } = NativeModules as any;

const emitter = new NativeEventEmitter(NotificationBridge || {});

export const startNativeNotificationListener = async () => {
  if (NotificationBridge && NotificationBridge.startListening) {
    NotificationBridge.startListening();
  }
};

export const stopNativeNotificationListener = async () => {
  if (NotificationBridge && NotificationBridge.stopListening) {
    NotificationBridge.stopListening();
  }
};

export const addNotificationListener = (cb: (payload: any) => void) => {
  return emitter.addListener('NotificationPosted', cb);
};

export const removeNotificationListener = (sub: any) => {
  try {
    sub.remove();
  } catch {}
};

export default {
  startNativeNotificationListener,
  stopNativeNotificationListener,
  addNotificationListener,
  removeNotificationListener,
};
