import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useThemePreference } from '../../lib/hooks/useThemePreference';

type TabName = 'index' | 'alerts' | 'settings/index';

type TabItem = {
  name: TabName;
  labelKey: string;
  focusedIcon: keyof typeof MaterialCommunityIcons.glyphMap;
  unfocusedIcon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const TAB_ITEMS: TabItem[] = [
  {
    name: 'index',
    labelKey: 'navigation.tabs.home',
    focusedIcon: 'shield-check',
    unfocusedIcon: 'shield-check-outline',
  },
  {
    name: 'alerts',
    labelKey: 'navigation.tabs.alerts',
    focusedIcon: 'alert-decagram',
    unfocusedIcon: 'alert-decagram-outline',
  },
  {
    name: 'settings/index',
    labelKey: 'navigation.tabs.settings',
    focusedIcon: 'cog',
    unfocusedIcon: 'cog-outline',
  },
];

export default function TabsLayout() {
  const { resolvedColorScheme } = useThemePreference();
  const { t } = useTranslation();

  const themeStyles = useMemo(() => {
    const isLight = resolvedColorScheme === 'light';
    return {
      activeTint: isLight ? '#2563eb' : '#60a5fa',
      inactiveTint: isLight ? '#64748b' : '#94a3b8',
      tabBarStyle: {
        alignItems: 'center',
        justifyContent: 'center',
        borderTopColor: isLight ? '#e2e8f0' : '#1e293b',
        backgroundColor: isLight ? '#ffffff' : '#0f172a',
        minHeight: 56,
        paddingTop: 6,
        paddingBottom: 8,
        elevation: 8,
        shadowColor: '#000000',
        shadowOpacity: 0.08,
        shadowRadius: 6,
      } as const,
    };
  }, [resolvedColorScheme]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: themeStyles.activeTint,
        tabBarInactiveTintColor: themeStyles.inactiveTint,
        tabBarStyle: themeStyles.tabBarStyle,
        tabBarLabelStyle: { display: 'none' },
        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
        },
      }}>
      {TAB_ITEMS.map(({ name, labelKey, focusedIcon, unfocusedIcon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarLabel: t(labelKey),
            tabBarIcon: ({ focused, color, size }) => (
              <MaterialCommunityIcons
                name={focused ? focusedIcon : unfocusedIcon}
                size={size}
                color={color}
              />
            ),
          }}
        />
      ))}
      <Tabs.Screen
        name="settings/diagnostics"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings/language"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings/model"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings/notifications"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings/trusted"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
