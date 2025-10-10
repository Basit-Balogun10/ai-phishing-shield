/* eslint-disable import/no-named-as-default-member */
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import am from '../locales/am.json';
import ar from '../locales/ar.json';
import en from '../locales/en.json';
import fr from '../locales/fr.json';
import ha from '../locales/ha.json';
import ig from '../locales/ig.json';
import pcm from '../locales/pcm.json';
import sw from '../locales/sw.json';
import yo from '../locales/yo.json';

export type SupportedLocale = 'am' | 'ar' | 'en' | 'fr' | 'ha' | 'ig' | 'pcm' | 'sw' | 'yo';

export const supportedLocales: SupportedLocale[] = [
  'am',
  'ar',
  'en',
  'fr',
  'ha',
  'ig',
  'pcm',
  'sw',
  'yo',
];

const resources = {
  am: { translation: am },
  ar: { translation: ar },
  en: { translation: en },
  fr: { translation: fr },
  ha: { translation: ha },
  ig: { translation: ig },
  pcm: { translation: pcm },
  sw: { translation: sw },
  yo: { translation: yo },
} satisfies Record<SupportedLocale, { translation: Record<string, unknown> }>;

export const resolveInitialLocale = (): SupportedLocale => {
  const [primaryLocale] = Localization.getLocales();
  const languageCode = primaryLocale?.languageCode?.toLowerCase();
  const normalizedTag = primaryLocale?.languageTag?.toLowerCase();

  const fallbackLocale: SupportedLocale = 'en';

  if (!languageCode && !normalizedTag) {
    return fallbackLocale;
  }

  const directMatch = (code?: string): SupportedLocale | null => {
    switch (code) {
      case 'am':
        return 'am';
      case 'ar':
        return 'ar';
      case 'en':
        return 'en';
      case 'fr':
        return 'fr';
      case 'ha':
        return 'ha';
      case 'ig':
        return 'ig';
      case 'pcm':
        return 'pcm';
      case 'sw':
      case 'swa':
        return 'sw';
      case 'yo':
      case 'yor':
        return 'yo';
      default:
        return null;
    }
  };

  const matchFromLanguageCode = directMatch(languageCode);
  if (matchFromLanguageCode) {
    return matchFromLanguageCode;
  }

  if (normalizedTag) {
    const [tagLanguage] = normalizedTag.split('-');
    const matchFromTag = directMatch(tagLanguage);
    if (matchFromTag) {
      return matchFromTag;
    }
    const explicitMatch = directMatch(normalizedTag);
    if (explicitMatch) {
      return explicitMatch;
    }
  }

  return fallbackLocale;
};

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    lng: resolveInitialLocale(),
    fallbackLng: 'en',
    resources,
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    supportedLngs: supportedLocales,
    load: 'languageOnly',
  });
}

export default i18n;
