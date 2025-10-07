import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { I18nextProvider } from 'react-i18next';

import i18n from '../lib/i18n';
import '../global.css';

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: '#f9fafb',
          },
        }}
      />
    </I18nextProvider>
  );
}
