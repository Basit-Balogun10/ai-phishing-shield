import AsyncStorage from '@react-native-async-storage/async-storage';

const IGNORED_APPS_KEY = 'notification_ignored_apps_v1';

export const getIgnoredPackages = async (): Promise<string[]> => {
  try {
    const raw = await AsyncStorage.getItem(IGNORED_APPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => typeof p === 'string');
  } catch (e) {
    console.warn('[notificationFilter] Failed to load ignored packages', e);
    return [];
  }
};

export const isPackageIgnored = async (pkg: string): Promise<boolean> => {
  if (!pkg) return false;
  const list = await getIgnoredPackages();
  return list.includes(pkg);
};

export const addIgnoredPackage = async (pkg: string): Promise<void> => {
  if (!pkg) return;
  const list = await getIgnoredPackages();
  if (list.includes(pkg)) return;
  list.push(pkg);
  await AsyncStorage.setItem(IGNORED_APPS_KEY, JSON.stringify(list));
};

export const removeIgnoredPackage = async (pkg: string): Promise<void> => {
  if (!pkg) return;
  const list = await getIgnoredPackages();
  const filtered = list.filter((p) => p !== pkg);
  await AsyncStorage.setItem(IGNORED_APPS_KEY, JSON.stringify(filtered));
};

export default {
  getIgnoredPackages,
  isPackageIgnored,
  addIgnoredPackage,
  removeIgnoredPackage,
};
