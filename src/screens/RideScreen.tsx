import React from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../app/App';
import { mockBluetooth } from '../modules/services';
import { useAppStore } from '../state/store';

const RideScreen = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'Ride'>) => {
  const {
    rideMode,
    ridePreference,
    helmetConnected,
    lastLocation,
    currentChannelId,
    nearbyRiders,
    intercomState,
    localMuted,
    globalMuted,
    endRide,
    toggleLocalMute,
    toggleGlobalMute,
  } = useAppStore((state) => ({
    rideMode: state.rideMode,
    ridePreference: state.ridePreference,
    helmetConnected: state.helmetConnected,
    lastLocation: state.lastLocation,
    currentChannelId: state.currentChannelId,
    nearbyRiders: state.nearbyRiders,
    intercomState: state.intercomState,
    localMuted: state.localMuted,
    globalMuted: state.globalMuted,
    endRide: state.endRide,
    toggleLocalMute: state.toggleLocalMute,
    toggleGlobalMute: state.toggleGlobalMute,
  }));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Ride Mode</Text>
      <Text>Mode: {rideMode}</Text>
      <Text>Preference: {ridePreference ?? 'N/A'}</Text>
      <Text>Helmet: {helmetConnected ? 'Connected' : 'Disconnected'}</Text>
      <Text>Last location: {lastLocation ?? 'Unknown'}</Text>

      <View style={styles.section}>
        <Text style={styles.subtitle}>Intercom</Text>
        <Text>Channel: {currentChannelId ?? 'None'}</Text>
        <Text>State: {intercomState}</Text>
        <Text>Local muted: {localMuted ? 'Yes' : 'No'}</Text>
        <Text>Global muted: {globalMuted ? 'Yes' : 'No'}</Text>
        <View style={styles.buttonRow}>
          <Button title="Toggle local mute" onPress={toggleLocalMute} />
        </View>
        <View style={styles.buttonRow}>
          <Button title="Toggle global mute" onPress={toggleGlobalMute} />
        </View>
        <View style={styles.buttonRow}>
          <Button title="Simulate headset local" onPress={() => mockBluetooth.simulateHeadsetEvent('LOCAL_MUTE_TOGGLE')} />
        </View>
        <View style={styles.buttonRow}>
          <Button title="Simulate headset global" onPress={() => mockBluetooth.simulateHeadsetEvent('GLOBAL_MUTE_TOGGLE')} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.subtitle}>Nearby riders ({nearbyRiders.length})</Text>
        {nearbyRiders.map((rider) => (
          <View key={rider.riderId} style={styles.riderRow}>
            <Text>{rider.riderId}</Text>
            <Text style={styles.small}>RSSI: {rider.rssi}</Text>
          </View>
        ))}
      </View>

      <View style={styles.buttonRow}>
        <Button title="End ride" onPress={endRide} />
      </View>
      <View style={styles.buttonRow}>
        <Button title="Back to home" onPress={() => navigation.navigate('Home')} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 18,
    marginVertical: 6,
  },
  section: {
    marginTop: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  riderRow: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  small: {
    fontSize: 12,
    color: '#555',
  },
  buttonRow: {
    marginVertical: 6,
  },
});

export default RideScreen;
