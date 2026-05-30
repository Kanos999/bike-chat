import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Accent, FONT } from './bikerTheme';
import type { AppNavigation } from '../app/App';
import { useAppStore } from '../state/store';

export type NavTabLabel = 'Comms' | 'Groups' | 'Routes' | 'Profile';

const NAV_TABS: { label: NavTabLabel; d: string }[] = [
  { label: 'Comms', d: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z' },
  {
    label: 'Groups',
    d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  },
  { label: 'Routes', d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' },
  { label: 'Profile', d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
];

interface Props {
  active: NavTabLabel;
  navigation: AppNavigation;
  accent: Accent;
}

/**
 * Shared bottom navigation bar lifted out of MainScreen so every screen presents
 * the same tabs. Comms→Home, Groups→Groups, Routes→RideSummary (latest ride),
 * Profile→Settings. Tapping the already-active tab is a no-op.
 */
function BottomNav({ active, navigation, accent }: Props) {
  const insets = useSafeAreaInsets();
  const lastSummary = useAppStore((s) => s.lastSummary);

  const onTab = (label: NavTabLabel) => {
    if (label === active) return;
    switch (label) {
      case 'Comms':
        navigation.navigate('Home');
        break;
      case 'Groups':
        navigation.navigate('Groups');
        break;
      case 'Routes':
        navigation.navigate('RideSummary', { summaryId: lastSummary?.id });
        break;
      case 'Profile':
        navigation.navigate('Settings');
        break;
    }
  };

  return (
    <View style={[styles.nav, { paddingBottom: insets.bottom > 0 ? 4 : 14 }]}>
      {NAV_TABS.map((tab) => {
        const isActive = tab.label === active;
        const color = isActive ? accent.base : 'rgba(255,255,255,0.2)';
        return (
          <Pressable key={tab.label} style={styles.navTab} onPress={() => onTab(tab.label)}>
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
              <Path d={tab.d} stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={[styles.navLabel, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    height: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    backgroundColor: 'rgba(12,12,12,0.95)',
  },
  navTab: { alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8 },
  navLabel: { fontFamily: FONT, fontSize: 9, letterSpacing: 1.1, textTransform: 'uppercase' },
});

export default BottomNav;
