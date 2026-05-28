import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { AppNavigation } from '../app/App';
import { AudioSpectrumVisualizer } from '../components/AudioSpectrumVisualizer';
import { mockBluetooth, services } from '../modules/services';
import type { AudioRoute } from '../modules/bluetooth/types';
import { useAppStore } from '../state/store';
import type { MatchedRider } from '../state/types';

type RideModePreference = 'OPEN' | 'FRIENDS_ONLY';

const BUBBLE_SIZE = 68;
const BUBBLE_RING = 3;

const BUBBLE_PALETTES = [
  { ring: ['#ff6b35', '#ff9a3c'], badge: '#ffd166' },
  { ring: ['#ff4d6d', '#ff8fa3'], badge: '#ffccd5' },
  { ring: ['#00b894', '#55efc4'], badge: '#9ff3e1' },
  { ring: ['#0984e3', '#74b9ff'], badge: '#cfe8ff' },
  { ring: ['#6c5ce7', '#a29bfe'], badge: '#ddd6ff' },
  { ring: ['#f39c12', '#f8c471'], badge: '#fde3a7' },
];

function riderPalette(id: string) {
  const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return BUBBLE_PALETTES[hash % BUBBLE_PALETTES.length];
}

function routeLabel(route: AudioRoute, helmetConnected: boolean): string {
  switch (route) {
    case 'BT_INTERCOM':
      return 'Helmet intercom mic';
    case 'WIRED_HEADSET':
      return 'External headset mic';
    case 'EARPIECE':
      return helmetConnected ? 'Fallback to phone earpiece' : 'Phone earpiece mic';
    case 'SPEAKER':
      return helmetConnected ? 'Fallback to phone speaker' : 'Phone speaker mic';
    default:
      return helmetConnected ? 'Routing to intercom...' : 'Phone mic';
  }
}

function routeTone(route: AudioRoute) {
  switch (route) {
    case 'BT_INTERCOM':
      return 'text-emerald-300 border-emerald-500/40 bg-emerald-500/12';
    case 'WIRED_HEADSET':
      return 'text-sky-300 border-sky-500/40 bg-sky-500/12';
    case 'EARPIECE':
    case 'SPEAKER':
      return 'text-amber-200 border-amber-500/40 bg-amber-500/12';
    default:
      return 'text-bike-text-muted border-bike-border bg-white/5';
  }
}

function RiderBubble({ rider }: { rider: MatchedRider }) {
  const palette = riderPalette(rider.riderId);
  const initials = rider.riderId.replace(/^rider-/, '').slice(0, 2).toUpperCase() || '?';
  const modeLabel = rider.rideMode === 'FRIENDS_ONLY' ? 'Friends' : 'Open';
  const distance = rider.distanceMeters > 0 ? `${rider.distanceMeters}m` : 'linked';

  return (
    <View className="items-center w-[96px] mr-3">
      <LinearGradient
        colors={palette.ring}
        start={{ x: 0.15, y: 1 }}
        end={{ x: 0.85, y: 0 }}
        style={{
          width: BUBBLE_SIZE + BUBBLE_RING * 2,
          height: BUBBLE_SIZE + BUBBLE_RING * 2,
          borderRadius: (BUBBLE_SIZE + BUBBLE_RING * 2) / 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          className="items-center justify-center rounded-full border border-white/10"
          style={{ width: BUBBLE_SIZE, height: BUBBLE_SIZE, backgroundColor: '#11161b' }}
        >
          <Text className="text-lg font-bold text-white tracking-[2px]">{initials}</Text>
        </View>
      </LinearGradient>
      <View
        className="absolute top-[48px] right-[6px] rounded-full border border-[#0d1115] px-1.5 py-0.5"
        style={{ backgroundColor: palette.badge }}
      >
        <Text className="text-[9px] font-bold text-black tracking-wide">{modeLabel}</Text>
      </View>
      <Text className="mt-2 text-xs font-semibold text-white/90 tracking-wide" numberOfLines={1}>
        {rider.riderId.replace(/^rider-/, '')}
      </Text>
      <Text className="mt-0.5 text-[11px] text-[#f4a261] tracking-wide">{distance}</Text>
    </View>
  );
}

function SelfBubble({ username }: { username: string }) {
  const riderId = username.trim() || 'You';
  const palette = riderPalette(riderId);
  const initials = riderId.slice(0, 2).toUpperCase() || 'Y';

  return (
    <LinearGradient
      colors={palette.ring}
      start={{ x: 0.15, y: 1 }}
      end={{ x: 0.85, y: 0 }}
      style={{
        width: 58,
        height: 58,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        className="items-center justify-center rounded-full border border-white/10"
        style={{ width: 52, height: 52, backgroundColor: '#11161b' }}
      >
        <Text className="text-sm font-bold text-white tracking-[2px]">{initials}</Text>
      </View>
    </LinearGradient>
  );
}

function StatChip({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'hot' | 'good' }) {
  const toneClass =
    tone === 'hot'
      ? 'border-[#ff6b35]/40 bg-[#ff6b35]/12'
      : tone === 'good'
        ? 'border-emerald-500/40 bg-emerald-500/12'
        : 'border-white/10 bg-white/5';

  return (
    <View className={`rounded-2xl border px-3 py-3 ${toneClass}`}>
      <Text className="text-[10px] uppercase tracking-[2px] text-bike-text-muted">{label}</Text>
      <Text className="mt-1 text-sm font-semibold text-white">{value}</Text>
    </View>
  );
}

function ActionButton({
  title,
  subtitle,
  active,
  onPress,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className={`flex-1 rounded-[24px] border px-4 py-4 ${active ? 'border-[#ff6b35]/50 bg-[#ff6b35]/14' : 'border-white/10 bg-white/5'}`}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <Text className="text-sm font-semibold text-white">{title}</Text>
      <Text className="mt-1 text-xs leading-5 text-bike-text-muted">{subtitle}</Text>
    </TouchableOpacity>
  );
}

const HomeScreen = ({ navigation }: { navigation: AppNavigation }) => {
  const rideMode = useAppStore((state) => state.rideMode);
  const statusMessage = useAppStore((state) => state.statusMessage);
  const lastSummary = useAppStore((state) => state.lastSummary);
  const matchedRiders = useAppStore((state) => state.matchedRiders);
  const connectedPeerIds = useAppStore((state) => state.connectedPeerIds);
  const username = useAppStore((state) => state.username);
  const startRide = useAppStore((state) => state.startRide);
  const endRide = useAppStore((state) => state.endRide);
  const helmetConnected = useAppStore((state) => state.helmetConnected);
  const audioRoute = useAppStore((state) => state.audioRoute);
  const lastLocation = useAppStore((state) => state.lastLocation);
  const currentChannelId = useAppStore((state) => state.currentChannelId);
  const intercomState = useAppStore((state) => state.intercomState);
  const localMuted = useAppStore((state) => state.localMuted);
  const globalMuted = useAppStore((state) => state.globalMuted);
  const isRecording = useAppStore((state) => state.isRecording);
  const toggleLocalMute = useAppStore((state) => state.toggleLocalMute);
  const toggleGlobalMute = useAppStore((state) => state.toggleGlobalMute);

  const [modePreference, setModePreference] = useState<RideModePreference>('OPEN');
  const [inputLevel, setInputLevel] = useState(0);

  const channelRiders = useMemo(() => {
    const ridersById = new Map(matchedRiders.map((rider) => [rider.riderId, rider]));
    return connectedPeerIds.map(
      (peerId) =>
        ridersById.get(peerId) ?? {
          riderId: peerId,
          rideMode: 'OPEN' as const,
          lat: 0,
          lon: 0,
          distanceMeters: 0,
        }
    );
  }, [connectedPeerIds, matchedRiders]);

  const canStart = rideMode === 'IDLE' || rideMode === 'ENDED';
  const isRiding =
    rideMode === 'ACTIVE_OPEN' ||
    rideMode === 'ACTIVE_FRIENDS_ONLY' ||
    rideMode === 'INITIALISING';
  const rideButtonProgress = useSharedValue(isRiding ? 1 : 0);
  const rideButtonPulse = useSharedValue(0);

  useEffect(() => {
    if (!isRiding) {
      setInputLevel(0);
      return;
    }

    const unsubscribe = services.voice.subscribeToInputLevel?.((level) => {
      setInputLevel(Math.max(0, Math.min(1, level)));
    });

    return () => {
      unsubscribe?.();
    };
  }, [isRiding]);

  useEffect(() => {
    rideButtonProgress.value = withSpring(isRiding ? 1 : 0, {
      damping: 16,
      stiffness: 180,
      mass: 0.9,
    });
    rideButtonPulse.value = withSequence(
      withTiming(1, { duration: 160 }),
      withTiming(0, { duration: 280 })
    );
  }, [isRiding, rideButtonProgress, rideButtonPulse]);

  const beginRide = useCallback(async () => {
    await startRide(modePreference);
  }, [modePreference, startRide]);

  const rideButtonShellStyle = useAnimatedStyle(() => {
    const progress = rideButtonProgress.value;
    const pulse = rideButtonPulse.value;
    return {
      backgroundColor: interpolateColor(progress, [0, 1], ['#ffffff', '#ff6b35']),
      transform: [
        { translateY: interpolate(progress, [0, 1], [0, -2]) },
        { scale: 1 + pulse * 0.025 },
      ],
      shadowColor: '#ff6b35',
      shadowOpacity: interpolate(progress + pulse * 0.5, [0, 1.5], [0.12, 0.34]),
      shadowRadius: interpolate(progress + pulse * 0.5, [0, 1.5], [10, 22]),
      shadowOffset: { width: 0, height: interpolate(progress, [0, 1], [6, 14]) },
      elevation: interpolate(progress + pulse * 0.5, [0, 1.5], [2, 8]),
    };
  });

  const rideButtonInnerStyle = useAnimatedStyle(() => {
    const progress = rideButtonProgress.value;
    const pulse = rideButtonPulse.value;
    return {
      borderColor: interpolateColor(progress, [0, 1], ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.18)']),
      backgroundColor: interpolateColor(progress, [0, 1], ['rgba(255,255,255,0)', 'rgba(0,0,0,0.06)']),
      transform: [{ scale: 1 - pulse * 0.012 }],
    };
  });

  const rideButtonBubbleStyle = useAnimatedStyle(() => {
    const progress = rideButtonProgress.value;
    const pulse = rideButtonPulse.value;
    return {
      transform: [
        { scale: 1 + pulse * 0.05 },
        { rotate: `${interpolate(progress, [0, 1], [0, -6]) + pulse * 6}deg` },
      ],
    };
  });

  const rideButtonTextWrapStyle = useAnimatedStyle(() => {
    const progress = rideButtonProgress.value;
    return {
      transform: [
        { translateX: interpolate(progress, [0, 1], [0, 4]) },
      ],
    };
  });

  return (
    <LinearGradient
      colors={['#0b0f13', '#10161d', '#171d24']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.95, y: 1 }}
      style={{ flex: 1 }}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 42 }}>
        <View className="px-5 pt-7">
          <Animated.View style={rideButtonShellStyle} className="rounded-[20px]">
            <TouchableOpacity
              className="rounded-[20px]"
              onPress={isRiding ? endRide : beginRide}
              disabled={!isRiding && !canStart}
              activeOpacity={0.9}
            >
              <Animated.View
                style={rideButtonInnerStyle}
                className="rounded-[20px] border p-1"
              >
                <View className="flex-row items-center">
                  <Animated.View style={rideButtonBubbleStyle}>
                    <SelfBubble username={username} />
                  </Animated.View>
                  <Animated.View style={rideButtonTextWrapStyle} className="ml-4 flex-1">
                    <Text className="text-lg font-bold tracking-[1px] text-black">
                      {isRiding ? 'End ride' : 'Start ride'}
                    </Text>
                    <Text className="mt-1 text-[11px] uppercase tracking-[2px] text-black/55">
                      {isRiding ? 'Tap to disengage the live intercom' : 'Tap to arm the proximity intercom'}
                    </Text>
                    <Text className="mt-2 text-xs text-black/65">
                      {username.trim() || 'Set your callsign in settings'}
                    </Text>
                  </Animated.View>
                </View>
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>

          <View className="rounded-b-[28px] border border-white/10 bg-[#121920] px-4 py-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] uppercase tracking-[3px] text-bike-text-muted">In your channel</Text>
              <Text className="text-xs text-[#f4a261]">{channelRiders.length > 0 ? `${channelRiders.length + 1} connected` : 'Awaiting peers'}</Text>
            </View>

            {channelRiders.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4">
                <View className="flex-row">
                  {channelRiders.map((rider) => (
                    <RiderBubble key={rider.riderId} rider={rider} />
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text className="mt-4 text-sm leading-6 text-[#90a0af]">
                Your linked riders will appear here as soon as the channel becomes active.
              </Text>
            )}
          </View>

          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-[11px] uppercase tracking-[3px] text-[#f4a261]">Bike Chat</Text>
            </View>
            <View className={`rounded-full border px-3 py-2 ${helmetConnected ? 'border-emerald-500/40 bg-emerald-500/12' : 'border-white/10 bg-white/5'}`}>
              <Text className={`text-[11px] font-semibold uppercase tracking-[2px] ${helmetConnected ? 'text-emerald-300' : 'text-bike-text-muted'}`}>
                {helmetConnected ? 'Intercom linked' : 'Phone audio'}
              </Text>
            </View>
          </View>

          <LinearGradient
            colors={['rgba(255,107,53,0.18)', 'rgba(255,107,53,0.05)', 'rgba(255,255,255,0.02)']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{ borderRadius: 30, marginTop: 22, padding: 1 }}
          >
            <View className="rounded-[29px] bg-[#11181f] px-5 py-5">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-[11px] uppercase tracking-[3px] text-bike-text-muted">Ride control</Text>
                  <Text className="mt-2 text-[24px] font-bold text-white">
                    {isRiding ? 'Channel live' : 'Ready to deploy'}
                  </Text>
                  <Text className="mt-2 text-sm leading-6 text-[#99a9b7]">
                    {statusMessage ?? 'Set your route, connect your intercom, and start the ride.'}
                  </Text>
                </View>
                <View className={`rounded-2xl border px-3 py-2 ${routeTone(audioRoute)}`}>
                  <Text className="text-[10px] uppercase tracking-[2px]">Mic source</Text>
                  <Text className="mt-1 text-xs font-semibold">{routeLabel(audioRoute, helmetConnected)}</Text>
                </View>
              </View>

              <View className="mt-5">
                <AudioSpectrumVisualizer
                  level={inputLevel}
                  muted={localMuted}
                  barColor="#ff6b35"
                  height={54}
                  barCount={22}
                  gap={5}
                  maxBarHeight={44}
                />
              </View>

              <View className="mt-5 flex-row flex-wrap gap-3">
                <View className="min-w-[110px] flex-1">
                  <StatChip label="Pilot" value={username.trim() || 'Unset'} />
                </View>
                <View className="min-w-[110px] flex-1">
                  <StatChip label="Intercom" value={intercomState.replace('_', ' ')} tone={currentChannelId ? 'hot' : 'default'} />
                </View>
                <View className="min-w-[110px] flex-1">
                  <StatChip label="Peers" value={String(channelRiders.length)} tone={channelRiders.length > 0 ? 'good' : 'default'} />
                </View>
              </View>
            </View>
          </LinearGradient>

          <View className="mt-4 flex-row gap-3">
            <ActionButton
              title={localMuted ? 'Mic muted' : 'Mute mic'}
              subtitle="Toggle your outbound voice without leaving the channel."
              active={localMuted}
              onPress={toggleLocalMute}
            />
            <ActionButton
              title={globalMuted ? 'All muted' : 'Mute all'}
              subtitle="Silence inbound rider audio while keeping channel sync."
              active={globalMuted}
              onPress={toggleGlobalMute}
            />
          </View>

          <View className="mt-5 rounded-[28px] border border-white/10 bg-[#121920] px-4 py-4">
            <Text className="text-[11px] uppercase tracking-[3px] text-bike-text-muted">Operational status</Text>
            <View className="mt-4 gap-3">
              <View className="flex-row items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                <Text className="text-sm text-bike-text-muted">Assigned channel</Text>
                <Text className="max-w-[55%] text-right text-sm font-semibold text-white">{currentChannelId ?? 'None'}</Text>
              </View>
              <View className="flex-row items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                <Text className="text-sm text-bike-text-muted">Audio route</Text>
                <Text className="max-w-[55%] text-right text-sm font-semibold text-white">{routeLabel(audioRoute, helmetConnected)}</Text>
              </View>
              <View className="flex-row items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                <Text className="text-sm text-bike-text-muted">Last known position</Text>
                <Text className="max-w-[55%] text-right text-sm font-semibold text-white">{lastLocation ?? 'Waiting for GPS'}</Text>
              </View>
              <View className="flex-row items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                <Text className="text-sm text-bike-text-muted">Recorder</Text>
                <Text className={`text-sm font-semibold ${isRecording ? 'text-emerald-300' : 'text-bike-text-muted'}`}>
                  {isRecording ? 'Live' : 'Idle'}
                </Text>
              </View>
            </View>
          </View>

          <View className="mt-5 rounded-[28px] border border-white/10 bg-[#121920] px-4 py-4">
            <Text className="text-[11px] uppercase tracking-[3px] text-bike-text-muted">Ride mode</Text>
            <View className="mt-4 flex-row gap-3">
              <TouchableOpacity
                className={`flex-1 rounded-[22px] border px-4 py-4 ${modePreference === 'OPEN' ? 'border-[#ff6b35]/50 bg-[#ff6b35]/12' : 'border-white/10 bg-white/5'}`}
                onPress={() => setModePreference('OPEN')}
                activeOpacity={0.88}
              >
                <Text className="text-base font-semibold text-white">Open</Text>
                <Text className="mt-1 text-xs leading-5 text-bike-text-muted">Match with any nearby rider using compatible mode.</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 rounded-[22px] border px-4 py-4 ${modePreference === 'FRIENDS_ONLY' ? 'border-[#ff6b35]/50 bg-[#ff6b35]/12' : 'border-white/10 bg-white/5'}`}
                onPress={() => setModePreference('FRIENDS_ONLY')}
                activeOpacity={0.88}
              >
                <Text className="text-base font-semibold text-white">Friends</Text>
                <Text className="mt-1 text-xs leading-5 text-bike-text-muted">Restrict channel pairing to riders also in Friends mode.</Text>
              </TouchableOpacity>
            </View>
          </View>

          {typeof __DEV__ !== 'undefined' && __DEV__ ? (
            <View className="mt-5 rounded-[28px] border border-white/10 bg-[#121920] px-4 py-4">
              <Text className="text-[11px] uppercase tracking-[3px] text-bike-text-muted">Device controls</Text>
              <View className="mt-4 flex-row gap-3">
                <ActionButton
                  title="Headset local"
                  subtitle="Simulate helmet mute button."
                  active={false}
                  onPress={() => mockBluetooth.simulateHeadsetEvent('LOCAL_MUTE_TOGGLE')}
                />
                <ActionButton
                  title="Headset global"
                  subtitle="Simulate all-audio mute button."
                  active={false}
                  onPress={() => mockBluetooth.simulateHeadsetEvent('GLOBAL_MUTE_TOGGLE')}
                />
              </View>
            </View>
          ) : null}

          <View className="mt-5 flex-row gap-3">
            <TouchableOpacity
              className="flex-1 items-center rounded-[22px] border border-white/10 bg-white/5 px-4 py-4"
              onPress={() => navigation.navigate('Settings')}
              activeOpacity={0.88}
            >
              <Text className="text-sm font-semibold text-white">Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 items-center rounded-[22px] border px-4 py-4 ${lastSummary ? 'border-[#ff6b35]/40 bg-[#ff6b35]/12' : 'border-white/10 bg-white/5 opacity-50'}`}
              onPress={() => navigation.navigate('RideSummary', { summaryId: lastSummary?.id })}
              disabled={!lastSummary}
              activeOpacity={0.88}
            >
              <Text className="text-sm font-semibold text-white">Last ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

export default HomeScreen;
