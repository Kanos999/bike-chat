import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import RideSummaryScreen from '../screens/RideSummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import LoginScreen from '../screens/LoginScreen';
import { config } from '../config';
import { services } from '../modules/services';
import { loadProfile } from '../state/profileStorage';
import { useAppStore } from '../state/store';

export type ScreenName = 'Home' | 'Ride' | 'RideSummary' | 'Settings';

export type RootStackParamList = {
  Home: undefined;
  Ride: undefined;
  RideSummary: { summaryId?: string };
  Settings: undefined;
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

const App = () => {
  const [screen, setScreen] = useState<ScreenName>('Home');
  const [params, setParams] = useState<RootStackParamList[ScreenName]>(undefined);
  const [history, setHistory] = useState<ScreenName[]>(['Home']);
  const { authReady, session, initializeAuth } = useAppStore((state) => ({
    authReady: state.authReady,
    session: state.session,
    initializeAuth: state.initializeAuth,
  }));

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
    loadProfile().then((profile) => useAppStore.getState().hydrateProfile(profile));
  }, []);

  useEffect(() => {
    services.analytics.getLastSummary().then((summary) => {
      if (summary) useAppStore.getState().setLastSummary(summary);
    });
  }, []);

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

  const renderScreen = () => {
    switch (screen) {
      case 'Home':
        return <HomeScreen navigation={navigation} />;
      case 'RideSummary':
        return <RideSummaryScreen navigation={navigation} route={{ params: params as RootStackParamList['RideSummary'] }} />;
      case 'Settings':
        return <SettingsScreen navigation={navigation} />;
      default:
        return <HomeScreen navigation={navigation} />;
    }
  };

  return <View style={{ flex: 1 }}>{renderScreen()}</View>;
};

export default App;
