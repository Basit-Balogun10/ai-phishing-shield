import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useThemePreference } from '../../lib/hooks/useThemePreference';

const TAB_ICONS: Record<string, { focused: string; unfocused: string }> = {
  index: { focused: 'shield-check', unfocused: 'shield-check-outline' },
  alerts: { focused: 'alert-decagram', unfocused: 'alert-decagram-outline' },
  settings: { focused: 'cog', unfocused: 'cog-outline' },
};

export default function TabsLayout() {
  const { resolvedColorScheme } = useThemePreference();
  const { t } = useTranslation();

  const { activeTint, inactiveTint, tabBarStyle, labelStyle } = useMemo(() => {
    const isLight = resolvedColorScheme === 'light';
    return {
      activeTint: isLight ? '#2563eb' : '#60a5fa',
      inactiveTint: isLight ? '#64748b' : '#94a3b8',
      tabBarStyle: {
        borderTopWidth: 0,
        backgroundColor: isLight ? '#ffffff' : '#0f172a',
        height: 64,
        paddingBottom: 10,
        paddingTop: 8,
      },
      labelStyle: {
        fontSize: 12,
        fontWeight: '600' as const,
        marginBottom: 0,
      },
    };
  }, [resolvedColorScheme]);

  const tabLabels = useMemo(
    () => ({
      index: t('navigation.tabs.home'),
      alerts: t('navigation.tabs.alerts'),
      settings: t('navigation.tabs.settings'),
    }),
    [t]
  );

  return (
    <Tabs
      screenOptions={({ route }) => {
        const icons = TAB_ICONS[route.name] ?? TAB_ICONS.index;
        return {
          headerShown: false,
          tabBarActiveTintColor: activeTint,
          tabBarInactiveTintColor: inactiveTint,
          tabBarStyle,
          tabBarLabel: ({ focused, color }) => (
            <Text
              style={{
                ...labelStyle,
                color,
                opacity: focused ? 1 : 0.85,
              }}>
              {tabLabels[route.name] ?? route.name}
            </Text>
          ),
          tabBarIcon: ({ focused, color, size }) => (
            <MaterialCommunityIcons
              name={focused ? icons.focused : icons.unfocused}
              size={size}
              color={color}
            />
          ),
        };
      }}
    />
  );
}
