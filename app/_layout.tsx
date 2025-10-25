import { useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { I18nextProvider } from 'react-i18next';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';

import i18n from '../lib/i18n';
import { configureNotificationHandling } from '../lib/notifications';
import { initializeMockBackgroundDetectionAsync } from '../lib/services/backgroundDetection';
import { initializeTelemetry } from '../lib/services/telemetryAdapter';
import { useThemePreference } from '../lib/hooks/useThemePreference';
import { trustedSourcesStore } from '../lib/trustedSources';
import '../global.css';

export default function RootLayout() {
  const { resolvedColorScheme, ready } = useThemePreference();
  const backgroundColor = useMemo(
    () => (resolvedColorScheme === 'light' ? '#f9fafb' : '#020617'),
    [resolvedColorScheme]
  );

  // Load Inter fonts but only gate app readiness on Android devices.
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_700Bold });
  const isAndroid = Platform.OS === 'android';

  useEffect(() => {
    SplashScreen.preventAutoHideAsync().catch(() => {
      // ignore if splash screen already hidden or unavailable
    });
  }, []);

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

  useEffect(() => {
    // On Android we wait for both theme readiness and fonts to load before hiding the splash.
    if (ready && (!isAndroid || fontsLoaded)) {
      SplashScreen.hideAsync().catch(() => {
        // ignore if splash screen already hidden
      });
    }
  }, [ready, fontsLoaded, isAndroid]);

  // If the theme is not ready, or on Android if fonts haven't loaded yet, keep the splash visible.
  if (!ready || (isAndroid && !fontsLoaded)) {
    return <View style={{ flex: 1, backgroundColor }} />;
  }

  return (
    <I18nextProvider i18n={i18n}>
      <View style={{ flex: 1, backgroundColor }} className={isAndroid && fontsLoaded ? 'font-sans' : ''}>
        <StatusBar
        style={resolvedColorScheme === 'light' ? 'dark' : 'light'}
        backgroundColor={backgroundColor}
      />
        <Stack
        initialRouteName="(tabs)"
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor,
          },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ presentation: 'modal' }} />
        </Stack>
      </View>
    </I18nextProvider>
  );
}
