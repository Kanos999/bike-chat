import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Svg, { Path } from 'react-native-svg';
import { accentFor, FONT } from './bikerTheme';
import type { RootTabParamList } from '../app/App';
import { useAppStore } from '../state/store';

export type NavTabLabel = 'Comms' | 'Groups' | 'Routes' | 'Profile';

const NAV_TABS: { label: NavTabLabel; route: keyof RootTabParamList; d: string }[] = [
  { label: 'Comms', route: 'Home', d: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z' },
  {
    label: 'Groups',
    route: 'Groups',
    d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  },
  { label: 'Routes', route: 'RideSummary', d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' },
  { label: 'Profile', route: 'Settings', d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
];

const RIDING_MODES = new Set(['INITIALISING', 'ACTIVE_OPEN', 'ACTIVE_FRIENDS_ONLY', 'SUSPENDED']);

/**
 * Shared bottom navigation, wired as react-navigation's custom tab bar so every
 * screen presents the same tabs and switching runs through the navigator (native
 * thread). Comms→Home, Groups→Groups, Routes→RideSummary, Profile→Settings.
 */
function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const rideMode = useAppStore((s) => s.rideMode);
  const ridePreference = useAppStore((s) => s.ridePreference);
  const lastSummary = useAppStore((s) => s.lastSummary);
  const incomingRequests = useAppStore(
    (s) => s.friendRequests.filter((r) => r.direction === 'incoming').length,
  );

  const riding = RIDING_MODES.has(rideMode);
  const group = rideMode === 'ACTIVE_FRIENDS_ONLY' || (riding && ridePreference === 'FRIENDS_ONLY');
  const accent = accentFor(group ? 'group' : 'open');

  const activeRoute = state.routes[state.index]?.name;
  const badgeFor = (label: NavTabLabel): number => (label === 'Groups' ? incomingRequests : 0);

  const onTab = (route: keyof RootTabParamList, routeKey: string) => {
    const isActive = activeRoute === route;
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!isActive && !event.defaultPrevented) {
      // RideSummary reads the latest ride from the store, so no params needed.
      navigation.navigate(route);
    }
  };

  return (
    <View style={[styles.nav, { paddingBottom: 12 + (insets.bottom > 0 ? insets.bottom : 6) }]}>
      {NAV_TABS.map((tab) => {
        const routeKey = state.routes.find((r) => r.name === tab.route)?.key ?? tab.route;
        const isActive = tab.route === activeRoute;
        const color = isActive ? accent.base : 'rgba(255,255,255,0.2)';
        const badge = badgeFor(tab.label);
        return (
          <Pressable key={tab.label} style={styles.navTab} onPress={() => onTab(tab.route, routeKey)}>
            <View>
              <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
                <Path d={tab.d} stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              {badge > 0 ? (
                <View style={[styles.badge, { backgroundColor: accent.base }]}>
                  <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.navLabel, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    // Symmetric top padding so the icons sit centred (no larger gap below than
    // above); no fixed height so the row grows to fit and never clips the icons.
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    backgroundColor: 'rgba(12,12,12,0.95)',
  },
  navTab: { alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 4 },
  navLabel: { fontFamily: FONT, fontSize: 9, letterSpacing: 1.1, textTransform: 'uppercase' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -9,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: FONT, fontSize: 10, letterSpacing: 0.5, color: '#000' },
});

export default BottomNav;
