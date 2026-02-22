import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Platform,
  PermissionsAndroid,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import RNSoundLevel from 'react-native-sound-level';
import type { AppNavigation } from '../app/App';
import { AudioSpectrumVisualizer } from '../components/AudioSpectrumVisualizer';
import { mockBluetooth, services } from '../modules/services';
import { useAppStore } from '../state/store';
import type { RiderBeacon } from '../modules/bluetooth/types';

/** Convert dB (-160 = silence) to 0–1 for the visualizer. */
function dbToLevel(db: number): number {
  const level = (db + 70) / 70;
  return Math.max(0, Math.min(1, level));
}

type RideModePreference = 'OPEN' | 'FRIENDS_ONLY';

const BUBBLE_SIZE = 64;
const BUBBLE_RING = 3;

function RiderBubble({ rider }: { rider: RiderBeacon }) {
  const initial = rider.riderId.replace(/^rider-/, '').slice(0, 2).toUpperCase() || '?';
  const hue = (rider.riderId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360);
  const ringColor = `hsl(${hue}, 65%, 55%)`;
  const fillColor = '#1a1612';

  return (
    <View className="items-center w-[88px]">
      <View
        className="items-center justify-center rounded-full border-[3px]"
        style={{ width: BUBBLE_SIZE + BUBBLE_RING * 2, height: BUBBLE_SIZE + BUBBLE_RING * 2, borderColor: ringColor }}
      >
        <View
          className="items-center justify-center rounded-full border border-bike-border w-16 h-16"
          style={{ backgroundColor: fillColor }}
        >
          <Text className="text-lg font-bold text-bike-text tracking-wide" numberOfLines={1}>
            {initial}
          </Text>
        </View>
      </View>
      <Text className="text-xs text-bike-text-muted mt-1.5 max-w-[96px] tracking-wide" numberOfLines={1}>
        {rider.riderId.replace(/^rider-/, '')}
      </Text>
    </View>
  );
}

const HomeScreen = ({ navigation }: { navigation: AppNavigation }) => {
  const {
    rideMode,
    ridePreference,
    statusMessage,
    lastSummary,
    nearbyRiders,
    username,
    startRide,
    endRide,
    helmetConnected,
    lastLocation,
    currentChannelId,
    intercomState,
    localMuted,
    globalMuted,
    isRecording,
    toggleLocalMute,
    toggleGlobalMute,
  } = useAppStore((state) => ({
    rideMode: state.rideMode,
    ridePreference: state.ridePreference,
    statusMessage: state.statusMessage,
    lastSummary: state.lastSummary,
    nearbyRiders: state.nearbyRiders,
    username: state.username,
    startRide: state.startRide,
    endRide: state.endRide,
    helmetConnected: state.helmetConnected,
    lastLocation: state.lastLocation,
    currentChannelId: state.currentChannelId,
    intercomState: state.intercomState,
    localMuted: state.localMuted,
    globalMuted: state.globalMuted,
    isRecording: state.isRecording,
    toggleLocalMute: state.toggleLocalMute,
    toggleGlobalMute: state.toggleGlobalMute,
  }));

  const [modePreference, setModePreference] = useState<RideModePreference>('OPEN');
  const [inputLevel, setInputLevel] = useState(0);
  const canStart = rideMode === 'IDLE' || rideMode === 'ENDED';
  const isRiding =
    rideMode === 'ACTIVE_OPEN' ||
    rideMode === 'ACTIVE_FRIENDS_ONLY' ||
    rideMode === 'INITIALISING';

  useEffect(() => {
    if (rideMode === 'ENDED' && lastSummary) {
      navigation.replace('RideSummary', { summaryId: lastSummary.id });
    }
  }, [rideMode, lastSummary, navigation]);

  const soundLevelStarted = useRef(false);

  useEffect(() => {
    if (!isRiding) {
      if (soundLevelStarted.current) {
        RNSoundLevel.stop().catch(() => {});
        soundLevelStarted.current = false;
      }
      setInputLevel(0);
      return;
    }

    let cancelled = false;

    const startSoundLevel = async () => {
      if (Platform.OS === 'android') {
        try {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: 'Microphone for voice',
              message: 'Bike Chat needs microphone access for ride intercom and level meter.',
              buttonNeutral: 'Ask later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );
        } catch {
          return;
        }
      }
      try {
        RNSoundLevel.onNewFrame = (data) => {
          if (!cancelled) setInputLevel(dbToLevel(data.value));
        };
        await RNSoundLevel.start({ monitoringInterval: 40, samplingRate: 16000 });
        soundLevelStarted.current = true;
      } catch (_) {
        // getStats-based level remains as fallback (voice module subscription not used here)
      }
    };

    startSoundLevel();

    return () => {
      cancelled = true;
      if (soundLevelStarted.current) {
        RNSoundLevel.stop().catch(() => {});
        soundLevelStarted.current = false;
      }
      RNSoundLevel.onNewFrame = () => {};
    };
  }, [isRiding]);

  const beginRide = useCallback(
    async () => {
      await startRide(modePreference);
    },
    [startRide, modePreference],
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View className="flex-grow pb-8 bg-bike-bg">
      <View className="flex-row mb-6">
        <TouchableOpacity
          className={`flex-1 py-3.5 items-center justify-center border ${modePreference === 'OPEN' ? 'bg-bike-card/80 border-bike-orange' : 'border-bike-border-orange'}`}
          onPress={() => setModePreference('OPEN')}
          activeOpacity={0.8}
        >
          <Text className={`text-base font-semibold tracking-wide ${modePreference === 'OPEN' ? 'text-bike-orange-bright' : 'text-bike-text-dim'}`}>
            Open
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3.5 items-center justify-center border ${modePreference === 'FRIENDS_ONLY' ? 'bg-bike-card/80 border-bike-orange' : 'border-bike-border-orange'}`}
          onPress={() => setModePreference('FRIENDS_ONLY')}
          activeOpacity={0.8}
        >
          <Text className={`text-base font-semibold tracking-wide ${modePreference === 'FRIENDS_ONLY' ? 'text-bike-orange-bright' : 'text-bike-text-dim'}`}>
            Friends
          </Text>
        </TouchableOpacity>
      </View>

      {nearbyRiders.length > 0 && (
        <View className="mb-6">
          <Text className="text-sm font-semibold text-bike-orange-muted mb-3 px-6 tracking-widest">
            Nearby riders
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <View className="flex-row items-center">
              {nearbyRiders.map((rider) => (
                <RiderBubble key={rider.riderId} rider={rider} />
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      <View className="px-6">
        <Text className="text-base text-bike-text-muted mb-0.5 tracking-wide">Ride mode: {rideMode}</Text>
        {statusMessage ? (
          <Text className="text-sm text-bike-orange-bright mb-5 tracking-wide">{statusMessage}</Text>
        ) : null}

        <View className="items-center mb-2">
          {isRiding ? (
            <TouchableOpacity
              className="min-w-[240px] min-h-[240px] py-4 px-12 bg-bike-card rounded-[120px] items-center justify-center border-2 border-bike-orange"
              onPress={endRide}
              activeOpacity={0.85}
            >
              <Text className="text-xl font-bold text-bike-orange tracking-wide">End ride</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              className={`min-w-[240px] min-h-[240px] py-4 px-12 bg-bike-card rounded-[120px] items-center justify-center border-2 border-bike-orange-muted ${!canStart ? 'border-bike-border opacity-60' : ''}`}
              onPress={beginRide}
              disabled={!canStart}
              activeOpacity={0.85}
            >
              <Text className="text-xl font-bold text-bike-text tracking-wide">Start ride</Text>
            </TouchableOpacity>
          )}
        </View>

        {isRecording ? (
          <Text className="text-[13px] font-semibold text-bike-orange mb-2 tracking-widest">Recording…</Text>
        ) : null}
        <Text className="text-sm text-bike-text-dim mb-2 tracking-wide">
          You: {username.trim() || '—'} · Helmet: {helmetConnected ? 'Connected' : 'Disconnected'} · Channel: {currentChannelId ?? 'None'}
        </Text>
        <Text className="text-sm text-bike-text-dim mb-2 tracking-wide">Location: {lastLocation ?? '—'}</Text>

        <View className="mt-4 mb-5 py-3 px-4 bg-bike-card rounded-lg border border-bike-border-orange">
          <Text className="text-sm font-semibold text-bike-orange-muted mb-2 tracking-widest">Intercom</Text>
          <Text className="text-sm text-bike-text-muted mb-1 tracking-wide">State: {intercomState}</Text>
          {isRiding && (
            <AudioSpectrumVisualizer
              level={inputLevel}
              muted={localMuted}
              barColor="#ff6600"
            />
          )}
          <View className="flex-row gap-3 mt-3 mb-2">
            <TouchableOpacity
              className={`py-2.5 px-4 bg-bike-bg rounded-md border ${localMuted ? 'border-bike-orange-dim bg-bike-card' : 'border-bike-border'}`}
              onPress={toggleLocalMute}
            >
              <Text className="text-sm font-semibold text-bike-text tracking-wide">
                {localMuted ? 'Unmute' : 'Mute'} mic
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`py-2.5 px-4 bg-bike-bg rounded-md border ${globalMuted ? 'border-bike-orange-dim bg-bike-card' : 'border-bike-border'}`}
              onPress={toggleGlobalMute}
            >
              <Text className="text-sm font-semibold text-bike-text tracking-wide">
                {globalMuted ? 'Unmute' : 'Mute'} all
              </Text>
            </TouchableOpacity>
          </View>
          <View className="my-1.5">
            <Button
              title="Simulate headset local"
              onPress={() => mockBluetooth.simulateHeadsetEvent('LOCAL_MUTE_TOGGLE')}
              color="#ff6600"
            />
          </View>
          <View className="my-1.5">
            <Button
              title="Simulate headset global"
              onPress={() => mockBluetooth.simulateHeadsetEvent('GLOBAL_MUTE_TOGGLE')}
              color="#ff6600"
            />
          </View>
        </View>

        <View className="mt-4 pt-4 border-t border-bike-border-orange">
          <View className="my-1.5">
            <Button
              title="View last ride"
              disabled={!lastSummary}
              onPress={() =>
                navigation.navigate('RideSummary', { summaryId: lastSummary?.id })
              }
              color="#cc7733"
            />
          </View>
          <View className="my-1.5">
            <Button
              title="Settings"
              onPress={() => navigation.navigate('Settings')}
              color="#cc7733"
            />
          </View>
        </View>
      </View>
      </View>
    </ScrollView>
  );
};

export default HomeScreen;
