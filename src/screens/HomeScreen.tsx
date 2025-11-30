import React, { useCallback } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../app/App';
import { useAppStore } from '../state/store';

const HomeScreen = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'Home'>) => {
  const { rideMode, ridePreference, statusMessage, startRide } = useAppStore((state) => ({
    rideMode: state.rideMode,
    ridePreference: state.ridePreference,
    statusMessage: state.statusMessage,
    startRide: state.startRide,
  }));

  const canStart = rideMode === 'IDLE' || rideMode === 'ENDED';

  const beginRide = useCallback(
    async (mode: 'OPEN' | 'FRIENDS_ONLY') => {
      await startRide(mode);
      navigation.navigate('Ride');
    },
    [navigation, startRide],
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Proximity Intercom MVP</Text>
      <Text style={styles.subtitle}>Current ride mode: {rideMode}</Text>
      <Text>Preference: {ridePreference ?? 'None'}</Text>
      {statusMessage ? <Text style={styles.status}>{statusMessage}</Text> : null}

      <View style={styles.buttonRow}>
        <Button title="Start Ride (Open)" disabled={!canStart} onPress={() => beginRide('OPEN')} />
      </View>
      <View style={styles.buttonRow}>
        <Button
          title="Start Ride (Friends)"
          disabled={!canStart}
          onPress={() => beginRide('FRIENDS_ONLY')}
        />
      </View>

      <View style={styles.buttonRow}>
        <Button title="Go to Ride Screen" onPress={() => navigation.navigate('Ride')} />
      </View>
      <View style={styles.buttonRow}>
        <Button title="Settings" onPress={() => navigation.navigate('Settings')} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
  },
  status: {
    color: '#2d6cdf',
  },
  buttonRow: {
    marginVertical: 8,
  },
});

export default HomeScreen;
