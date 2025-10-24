import { useCallback, useEffect, useMemo, useState } from 'react';

import i18n, { resolveInitialLocale, supportedLocales, type SupportedLocale } from '../i18n';
import {
  clearLanguagePreference,
  getLanguagePreference,
  setLanguagePreference,
  type StoredLocale,
} from '../storage';

export type LanguagePreferenceState = {
  locale: SupportedLocale;
  ready: boolean;
  availableLocales: SupportedLocale[];
  setLocale: (locale: SupportedLocale) => Promise<void>;
  resetToSystem: () => Promise<void>;
  usingDeviceDefault: boolean;
};

const DEVICE_LOCALE: SupportedLocale = resolveInitialLocale();

const normalizeLocale = (value: string | null | undefined): SupportedLocale => {
  if (!value) {
    return DEVICE_LOCALE;
  }

  const normalized = value.toLowerCase();
  const [base] = normalized.split('-');
  return (
    supportedLocales.find((locale) => locale === normalized) ??
    supportedLocales.find((locale) => locale === base) ??
    DEVICE_LOCALE
  );
};

export function useLanguagePreference(): LanguagePreferenceState {
  const [locale, setLocaleState] = useState<SupportedLocale>(normalizeLocale(i18n.language));
  const [ready, setReady] = useState(false);
  const [storedLocale, setStoredLocale] = useState<StoredLocale | null>(null);

  useEffect(() => {
    let syncCancelled = false;

    const hydrate = async () => {
      try {
        const stored = await getLanguagePreference();
        const nextLocale = normalizeLocale(stored ?? DEVICE_LOCALE);

        if (!syncCancelled) {
          if (i18n.language !== nextLocale) {
            await i18n.changeLanguage(nextLocale);
          }
          setLocaleState(nextLocale);
          setStoredLocale(stored ?? null);
          setReady(true);
        }
      } catch (error) {
        console.warn('[i18n] Failed to hydrate language preference', error);
        if (!syncCancelled) {
          setReady(true);
        }
      }
    };

    hydrate();

    return () => {
      syncCancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleLanguageChange = (nextLocale: string) => {
      setLocaleState(normalizeLocale(nextLocale));
    };

    i18n.on('languageChanged', handleLanguageChange);

    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, []);

  const persistLocale = useCallback(async (nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
    await i18n.changeLanguage(nextLocale);
    await setLanguagePreference(nextLocale as StoredLocale);
    setStoredLocale(nextLocale as StoredLocale);
  }, []);

  const resetToSystem = useCallback(async () => {
    setLocaleState(DEVICE_LOCALE);
    await i18n.changeLanguage(DEVICE_LOCALE);
    await clearLanguagePreference();
    setStoredLocale(null);
  }, []);

  return useMemo(
    () => ({
      locale,
      ready,
      availableLocales: supportedLocales,
      setLocale: persistLocale,
      resetToSystem,
      usingDeviceDefault: storedLocale === null,
    }),
    [locale, persistLocale, ready, resetToSystem, storedLocale]
  );
}
