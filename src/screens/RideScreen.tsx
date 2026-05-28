import React from 'react';
import { Button, ScrollView, Text, View } from 'react-native';
import type { AppNavigation } from '../app/App';
import { mockBluetooth } from '../modules/services';
import { useAppStore } from '../state/store';

const RideScreen = ({ navigation }: { navigation: AppNavigation }) => {
  const rideMode = useAppStore((state) => state.rideMode);
  const ridePreference = useAppStore((state) => state.ridePreference);
  const helmetConnected = useAppStore((state) => state.helmetConnected);
  const lastLocation = useAppStore((state) => state.lastLocation);
  const currentChannelId = useAppStore((state) => state.currentChannelId);
  const nearbyRiders = useAppStore((state) => state.nearbyRiders);
  const intercomState = useAppStore((state) => state.intercomState);
  const localMuted = useAppStore((state) => state.localMuted);
  const globalMuted = useAppStore((state) => state.globalMuted);
  const lastSummary = useAppStore((state) => state.lastSummary);
  const isRecording = useAppStore((state) => state.isRecording);
  const endRide = useAppStore((state) => state.endRide);
  const toggleLocalMute = useAppStore((state) => state.toggleLocalMute);
  const toggleGlobalMute = useAppStore((state) => state.toggleGlobalMute);

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
