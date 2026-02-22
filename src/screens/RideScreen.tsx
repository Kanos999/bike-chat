import React, { useEffect } from 'react';
import { Button, ScrollView, Text, View } from 'react-native';
import type { AppNavigation } from '../app/App';
import { mockBluetooth } from '../modules/services';
import { useAppStore } from '../state/store';

const RideScreen = ({ navigation }: { navigation: AppNavigation }) => {
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
    lastSummary,
    isRecording,
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
    lastSummary: state.lastSummary,
    isRecording: state.isRecording,
    endRide: state.endRide,
    toggleLocalMute: state.toggleLocalMute,
    toggleGlobalMute: state.toggleGlobalMute,
  }));

  useEffect(() => {
    if (rideMode === 'ENDED' && lastSummary) {
      navigation.replace('RideSummary', { summaryId: lastSummary.id });
    }
  }, [rideMode, lastSummary, navigation]);

  return (
    <ScrollView>
      <View className="p-5 gap-3">
      <Text className="text-[22px] font-bold">Ride Mode</Text>
      <Text>Mode: {rideMode}</Text>
      {isRecording ? <Text className="text-bike-orange font-semibold">Recording…</Text> : null}
      <Text>Preference: {ridePreference ?? 'N/A'}</Text>
      <Text>Helmet: {helmetConnected ? 'Connected' : 'Disconnected'}</Text>
      <Text>Last location: {lastLocation ?? 'Unknown'}</Text>

      <View className="mt-3 py-2 border-t border-bike-border">
        <Text className="text-lg my-1.5">Intercom</Text>
        <Text>Channel: {currentChannelId ?? 'None'}</Text>
        <Text>State: {intercomState}</Text>
        <Text>Local muted: {localMuted ? 'Yes' : 'No'}</Text>
        <Text>Global muted: {globalMuted ? 'Yes' : 'No'}</Text>
        <View className="my-1.5">
          <Button title="Toggle local mute" onPress={toggleLocalMute} />
        </View>
        <View className="my-1.5">
          <Button title="Toggle global mute" onPress={toggleGlobalMute} />
        </View>
        <View className="my-1.5">
          <Button title="Simulate headset local" onPress={() => mockBluetooth.simulateHeadsetEvent('LOCAL_MUTE_TOGGLE')} />
        </View>
        <View className="my-1.5">
          <Button title="Simulate headset global" onPress={() => mockBluetooth.simulateHeadsetEvent('GLOBAL_MUTE_TOGGLE')} />
        </View>
      </View>

      <View className="mt-3 py-2 border-t border-bike-border">
        <Text className="text-lg my-1.5">Nearby riders ({nearbyRiders.length})</Text>
        {nearbyRiders.map((rider) => (
          <View key={rider.riderId} className="py-1 border-b border-bike-text-muted/30">
            <Text>{rider.riderId}</Text>
            <Text className="text-xs text-bike-text-dim">RSSI: {rider.rssi}</Text>
          </View>
        ))}
      </View>

      <View className="my-1.5">
        <Button title="End ride" onPress={endRide} />
      </View>
      <View className="my-1.5">
        <Button title="Back to home" onPress={() => navigation.navigate('Home')} />
      </View>
      </View>
    </ScrollView>
  );
};

export default RideScreen;
