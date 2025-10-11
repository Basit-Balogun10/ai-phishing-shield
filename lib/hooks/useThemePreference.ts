import { useCallback, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';

import { getThemePreference, setThemePreference, ThemePreference } from '../storage';

export type ThemePreferenceState = {
  preference: ThemePreference;
  resolvedColorScheme: 'light' | 'dark';
  ready: boolean;
  setPreference: (preference: ThemePreference) => Promise<void>;
  togglePreference: () => Promise<void>;
};

const DEFAULT_PREFERENCE: ThemePreference = 'system';

const getSystemScheme = (): 'light' | 'dark' =>
  (Appearance.getColorScheme() ?? 'light') as 'light' | 'dark';

const resolveColorScheme = (
  preference: ThemePreference,
  systemScheme: 'light' | 'dark'
): 'light' | 'dark' => {
  if (preference === 'system') {
    return systemScheme;
  }
  return preference;
};

export function useThemePreference(): ThemePreferenceState {
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_PREFERENCE);
  const [resolvedColorScheme, setResolvedColorScheme] = useState<'light' | 'dark'>(() =>
    getSystemScheme()
  );
  const [ready, setReady] = useState(false);
  const { setColorScheme } = useNativeWindColorScheme();

  const applyColorScheme = useCallback(
    (scheme: 'light' | 'dark') => {
      setResolvedColorScheme(scheme);
      setColorScheme?.(scheme);
    },
    [setColorScheme]
  );

  useEffect(() => {
    let isMounted = true;

    const loadPreference = async () => {
      const storedPreference = await getThemePreference();
      const systemScheme = getSystemScheme();
      const effectivePreference = storedPreference ?? DEFAULT_PREFERENCE;
      const resolvedScheme = resolveColorScheme(effectivePreference, systemScheme);

      if (!isMounted) {
        return;
      }

      setPreferenceState(effectivePreference);
      applyColorScheme(resolvedScheme);
      setReady(true);
    };

    loadPreference();

    return () => {
      isMounted = false;
    };
  }, [applyColorScheme]);

  useEffect(() => {
    if (preference !== 'system') {
      return;
    }

    const listener = Appearance.addChangeListener(({ colorScheme: nextScheme }) => {
      const resolvedScheme = resolveColorScheme(
        'system',
        (nextScheme ?? 'light') as 'light' | 'dark'
      );
      applyColorScheme(resolvedScheme);
    });

    return () => listener.remove();
  }, [applyColorScheme, preference]);

  useEffect(() => {
    if (ready) {
      const systemScheme = getSystemScheme();
      const resolvedScheme = resolveColorScheme(preference, systemScheme);
      applyColorScheme(resolvedScheme);
    }
  }, [applyColorScheme, preference, ready]);

  const persistPreference = useCallback(
    async (nextPreference: ThemePreference) => {
      setPreferenceState(nextPreference);
      const systemScheme = getSystemScheme();
      const resolvedScheme = resolveColorScheme(nextPreference, systemScheme);
      applyColorScheme(resolvedScheme);
      await setThemePreference(nextPreference);
    },
    [applyColorScheme]
  );

  const togglePreference = useCallback(async () => {
    const rotation: ThemePreference[] = ['system', 'light', 'dark'];
    const currentIndex = rotation.indexOf(preference);
    const nextPreference = rotation[(currentIndex + 1) % rotation.length] ?? DEFAULT_PREFERENCE;
    await persistPreference(nextPreference);
  }, [persistPreference, preference]);

  return useMemo(
    () => ({
      preference,
      resolvedColorScheme,
      ready,
      setPreference: persistPreference,
      togglePreference,
    }),
    [persistPreference, preference, ready, resolvedColorScheme, togglePreference]
  );
}
