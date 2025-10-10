import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { I18nextProvider } from 'react-i18next';

import i18n from '../lib/i18n';
import { configureNotificationHandling } from '../lib/notifications';
import { initializeMockBackgroundDetectionAsync } from '../lib/services/backgroundDetection';
import { initializeTelemetry } from '../lib/services/telemetryAdapter';
import { useThemePreference } from '../lib/hooks/useThemePreference';
import { trustedSourcesStore } from '../lib/trustedSources';
import '../global.css';

export default function RootLayout() {
  const { resolvedColorScheme, ready } = useThemePreference();

  useEffect(() => {
    configureNotificationHandling();
    initializeMockBackgroundDetectionAsync();
    trustedSourcesStore.initialize();
    initializeTelemetry().catch((error) => {
      if (__DEV__) {
        console.warn('[telemetry] initialization failed', error);
      }
    });
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <I18nextProvider i18n={i18n}>
      <StatusBar style={resolvedColorScheme === 'light' ? 'dark' : 'light'} />
      <Stack
        initialRouteName="(tabs)"
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: resolvedColorScheme === 'light' ? '#f9fafb' : '#020617',
          },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ presentation: 'modal' }} />
      </Stack>
    </I18nextProvider>
  );
}
