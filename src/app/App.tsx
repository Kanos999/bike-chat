import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  DefaultTheme,
  NavigationContainer,
  useNavigationContainerRef,
  type Theme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { parseJoinCode } from '../modules/deepLink';
import MainScreen from '../screens/MainScreen';
import RideSummaryScreen from '../screens/RideSummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import GroupsScreen from '../screens/GroupsScreen';
import LoginScreen from '../screens/LoginScreen';
import UsernameSetupScreen from '../screens/UsernameSetupScreen';
import BottomNav from '../components/BottomNav';
import { COLORS } from '../components/bikerTheme';
import { config } from '../config';
import { services } from '../modules/services';
import { loadProfile } from '../state/profileStorage';
import { useAppStore } from '../state/store';

/**
 * Bottom-tab routes. Screens call `navigation.navigate('Settings')` etc. to jump
 * tabs; react-navigation runs the switch on the native thread (react-native-screens),
 * so it stays snappy even while the JS thread is busy, and only the focused tab is
 * rendered (lazy) instead of every screen staying mounted.
 */
export type RootTabParamList = {
  Home: undefined;
  Groups: undefined;
  RideSummary: { summaryId?: string } | undefined;
  Settings: undefined;
};

export type ScreenName = keyof RootTabParamList;

// Minimal navigation shape the screens rely on. react-navigation's navigation
// object satisfies it (it exposes `.navigate`); only `navigate` is used app-wide.
export type AppNavigation = { navigate: (screen: ScreenName, params?: object) => void };

const Tab = createBottomTabNavigator<RootTabParamList>();

// Match the app's black background so route changes never flash a white frame.
const navTheme: Theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: COLORS.bg, card: COLORS.bg },
};

const AppInner = () => {
  const authReady = useAppStore((s) => s.authReady);
  const session = useAppStore((s) => s.session);
  const username = useAppStore((s) => s.username);
  const initializeAuth = useAppStore((s) => s.initializeAuth);
  const handleAuthRedirect = useAppStore((s) => s.handleAuthRedirect);
  // Gate on the persisted profile having loaded so we don't flash the callsign
  // setup screen at existing users before hydrateProfile fills in their username.
  const [profileReady, setProfileReady] = useState(false);

  // Crew-invite deep links (bikechat://join?code=…). The code is stashed until the
  // navigator is ready (i.e. the user is signed in + has a callsign), then the crew
  // is joined and we jump to the Groups tab.
  const navRef = useNavigationContainerRef<RootTabParamList>();
  const pendingJoin = useRef<string | null>(null);

  const flushPendingJoin = useCallback(async () => {
    const code = pendingJoin.current;
    if (!code || !navRef.isReady()) return;
    pendingJoin.current = null;
    const group = await useAppStore.getState().joinGroup(code);
    navRef.navigate('Groups');
    Alert.alert(
      group ? 'Crew joined' : "Couldn't join crew",
      group ? `You've joined "${group.name}".` : 'That crew code is invalid or expired.',
    );
  }, [navRef]);

  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url) return;
      if (await handleAuthRedirect(url)) return;
      const code = parseJoinCode(url);
      if (!code) return;
      pendingJoin.current = code;
      void flushPendingJoin();
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [flushPendingJoin, handleAuthRedirect]);

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
      setProfileReady(true);
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

  if (!authReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  // Authenticated but no callsign yet (riderId is derived from it): force setup,
  // otherwise Start Ride silently blocks on a missing riderId. Wait for the
  // persisted profile to load first so returning users skip straight through.
  if (profileReady && !username.trim()) {
    return <UsernameSetupScreen />;
  }

  return (
    <NavigationContainer ref={navRef} theme={navTheme} onReady={flushPendingJoin}>
      <Tab.Navigator
        backBehavior="history"
        screenOptions={{ headerShown: false, lazy: true }}
        tabBar={(props) => <BottomNav {...props} />}
      >
        <Tab.Screen name="Home" component={MainScreen} />
        <Tab.Screen name="Groups" component={GroupsScreen} />
        <Tab.Screen name="RideSummary" component={RideSummaryScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

const App = () => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  </GestureHandlerRootView>
);

export default App;
