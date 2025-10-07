/* eslint-disable import/no-named-as-default-member */
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../locales/en.json';
import fr from '../locales/fr.json';

type SupportedLocale = 'en' | 'fr';

const resources = {
  en: { translation: en },
  fr: { translation: fr },
} satisfies Record<SupportedLocale, { translation: Record<string, unknown> }>;

const getInitialLocale = (): SupportedLocale => {
  const [primaryLocale] = Localization.getLocales();
  const languageCode = primaryLocale?.languageCode?.toLowerCase();

  switch (languageCode) {
    case 'fr':
      return 'fr';
    default:
      return 'en';
  }
};

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    lng: getInitialLocale(),
    fallbackLng: 'en',
    resources,
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    supportedLngs: ['en', 'fr'],
    load: 'languageOnly',
  });
}

export default i18n;
