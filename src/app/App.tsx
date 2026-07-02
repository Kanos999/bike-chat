import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MainScreen from '../screens/MainScreen';
import RideSummaryScreen from '../screens/RideSummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import GroupsScreen from '../screens/GroupsScreen';
import LoginScreen from '../screens/LoginScreen';
import { config } from '../config';
import { services } from '../modules/services';
import { loadProfile } from '../state/profileStorage';
import { useAppStore } from '../state/store';

export type ScreenName = 'Home' | 'Ride' | 'RideSummary' | 'Settings' | 'Groups';

export type RootStackParamList = {
  Home: undefined;
  Ride: undefined;
  RideSummary: { summaryId?: string };
  Settings: undefined;
  Groups: undefined;
};

export type AppNavigation = {
  navigate: <T extends ScreenName>(
    screen: T,
    params?: RootStackParamList[T] extends undefined ? undefined : RootStackParamList[T],
  ) => void;
  replace: <T extends ScreenName>(
    screen: T,
    params?: RootStackParamList[T] extends undefined ? undefined : RootStackParamList[T],
  ) => void;
  goBack: () => void;
};

const AppInner = () => {
  const [screen, setScreen] = useState<ScreenName>('Home');
  const [params, setParams] = useState<RootStackParamList[ScreenName]>(undefined);
  const [history, setHistory] = useState<ScreenName[]>(['Home']);
  const authReady = useAppStore((state) => state.authReady);
  const session = useAppStore((state) => state.session);
  const initializeAuth = useAppStore((state) => state.initializeAuth);

  const navigation: AppNavigation = React.useMemo(
    () => ({
      navigate: (name, p) => {
        setParams(p ?? undefined);
        setScreen(name);
        setHistory((h) => [...h, name]);
      },
      replace: (name, p) => {
        setParams(p ?? undefined);
        setScreen(name);
        setHistory((h) => [...h.slice(0, -1), name]);
      },
      goBack: () => {
        setHistory((h) => {
          if (h.length <= 1) return h;
          const next = h.slice(0, -1);
          setScreen(next[next.length - 1]);
          setParams(undefined);
          return next;
        });
      },
    }),
    [],
  );

  useEffect(() => {
    config.riderIdGetter = () => useAppStore.getState().riderId;
  }, []);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    loadProfile().then((profile) => {
      useAppStore.getState().hydrateProfile(profile);
      useAppStore.getState().hydrateGroupPrefs(profile);
    });
  }, []);

  // Once signed in, pull the rider's crews, friends, and ride history from Supabase.
  useEffect(() => {
    if (!session) return;
    const store = useAppStore.getState();
    void store.loadGroups();
    void store.loadFriends();
    void store.loadRides();
  }, [session]);

  useEffect(() => {
    services.analytics.getLastSummary().then((summary) => {
      if (summary) useAppStore.getState().setLastSummary(summary);
    });
  }, []);

  // Keep visited screens mounted and toggle visibility, so tab switches are a style
  // flip instead of an unmount/remount. Avoids re-paying each screen's mount cost
  // (MainScreen's animated nodes + ring measure, GroupsScreen's loadGroups fetch).
  // Screens are mounted lazily on first visit so we don't pay for unopened tabs.
  // NOTE: must stay above the early returns below — hooks can't run conditionally.
  const visited = React.useRef<Set<ScreenName>>(new Set([screen]));
  visited.current.add(screen);

  if (!authReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  const screenFor = (name: ScreenName): React.ReactNode => {
    switch (name) {
      case 'Home':
        return <MainScreen navigation={navigation} />;
      case 'RideSummary':
        return <RideSummaryScreen navigation={navigation} />;
      case 'Settings':
        return <SettingsScreen navigation={navigation} />;
      case 'Groups':
        return <GroupsScreen navigation={navigation} />;
      default:
        return null;
    }
  };

  const ALL_SCREENS: ScreenName[] = ['Home', 'Groups', 'RideSummary', 'Settings'];

  return (
    <View style={{ flex: 1 }}>
      {ALL_SCREENS.filter((name) => visited.current.has(name)).map((name) => (
        <ScreenLayer key={name} active={name === screen}>
          {screenFor(name)}
        </ScreenLayer>
      ))}
    </View>
  );
};

/**
 * Stacked screen that crossfades in when it becomes active, so tab switches are a
 * smooth fade rather than an instant cut. Inactive layers sit at opacity 0 beneath
 * (kept mounted for perf) and don't intercept touches.
 */
function ScreenLayer({ active, children }: { active: boolean; children: React.ReactNode }) {
  const opacity = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, { duration: 200 });
  }, [active, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { zIndex: active ? 1 : 0 }, style]}
      pointerEvents={active ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
}

const App = () => (
  <SafeAreaProvider>
    <AppInner />
  </SafeAreaProvider>
);

export default App;
