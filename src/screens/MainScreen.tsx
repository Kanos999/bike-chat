import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  interpolate,
  interpolateColor,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import ConcentricRings from '../components/ConcentricRings';
import RiderDot, { Rider } from '../components/RiderDot';
import { accentFor, COLORS, FONT, HELMET_PATH, Mode } from '../components/bikerTheme';
import type { AppNavigation } from '../app/App';
import { services } from '../modules/services';
import { useAppStore } from '../state/store';

const WAVE_BARS = [5, 9, 14, 10, 7, 12, 6, 9, 5];

const NAV_TABS: { label: string; active: boolean; d: string }[] = [
  { label: 'Comms', active: true, d: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z' },
  {
    label: 'Groups',
    active: false,
    d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  },
  { label: 'Routes', active: false, d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' },
  { label: 'Profile', active: false, d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
];

function formatDist(m: number): string {
  if (!m || m <= 0) return 'linked';
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

// Stable per-rider angle so a given rider keeps the same spot on the radar.
function angleFor(riderId: string): number {
  let h = 0;
  for (let i = 0; i < riderId.length; i += 1) h = (h * 31 + riderId.charCodeAt(i)) >>> 0;
  return h % 360;
}

export default function MainScreen({ navigation }: { navigation: AppNavigation }) {
  const insets = useSafeAreaInsets();

  // --- Live ride state from the store ---
  const rideMode = useAppStore((s) => s.rideMode);
  const ridePreference = useAppStore((s) => s.ridePreference);
  const username = useAppStore((s) => s.username);
  const matchedRiders = useAppStore((s) => s.matchedRiders);
  const connectedPeerIds = useAppStore((s) => s.connectedPeerIds);
  const currentChannelId = useAppStore((s) => s.currentChannelId);
  const intercomState = useAppStore((s) => s.intercomState);
  const localMuted = useAppStore((s) => s.localMuted);
  const globalMuted = useAppStore((s) => s.globalMuted);
  const helmetConnected = useAppStore((s) => s.helmetConnected);
  const lastLocation = useAppStore((s) => s.lastLocation);
  const statusMessage = useAppStore((s) => s.statusMessage);
  const lastSummary = useAppStore((s) => s.lastSummary);
  const startRide = useAppStore((s) => s.startRide);
  const endRide = useAppStore((s) => s.endRide);

  const isRiding =
    rideMode === 'INITIALISING' ||
    rideMode === 'ACTIVE_OPEN' ||
    rideMode === 'ACTIVE_FRIENDS_ONLY' ||
    rideMode === 'SUSPENDED';
  const canStart = rideMode === 'IDLE' || rideMode === 'ENDED';
  const initialising = rideMode === 'INITIALISING';

  // Mode toggle: free to change while idle; while riding it reflects the active mode.
  const [selectedPref, setSelectedPref] = useState<Mode>('open');
  const ridingGroup =
    rideMode === 'ACTIVE_FRIENDS_ONLY' || (isRiding && ridePreference === 'FRIENDS_ONLY');
  const mode: Mode = isRiding ? (ridingGroup ? 'group' : 'open') : selectedPref;
  const isOpen = mode === 'open';
  const accent = accentFor(mode);

  // --- Riders on the radar: channel members, accent-lit when WebRTC-connected ---
  const riders = useMemo(
    () =>
      matchedRiders.map((m, i) => ({
        riderId: m.riderId,
        rider: {
          id: i + 1,
          handle: m.riderId.replace(/^rider-/, ''),
          angle: angleFor(m.riderId),
          dist: formatDist(m.distanceMeters),
          speaking: connectedPeerIds.includes(m.riderId),
        } as Rider,
      })),
    [matchedRiders, connectedPeerIds],
  );

  // --- Mic input level feeds the waveform amplitude (no re-render: written to a shared value) ---
  const micLevel = useSharedValue(0);
  useEffect(() => {
    if (!isRiding) {
      micLevel.value = 0;
      return;
    }
    const unsubscribe = services.voice.subscribeToInputLevel?.((level) => {
      micLevel.value = Math.max(0, Math.min(1, level));
    });
    return () => {
      unsubscribe?.();
      micLevel.value = 0;
    };
  }, [isRiding, micLevel]);

  const channelLive = isRiding && !!currentChannelId;
  const transmitting = channelLive && intercomState === 'OPEN'; // in channel and unmuted

  // Radar geometry for dot placement + the full-bleed ring layer.
  const [radarSize, setRadarSize] = useState(0);
  const [centre, setCentre] = useState({ x: 0, y: 0 });
  const radarRef = useRef<View>(null);
  const onRadarLayout = (e: LayoutChangeEvent) => {
    setRadarSize(e.nativeEvent.layout.width);
    radarRef.current?.measureInWindow((px, py, w, h) => {
      setCentre({ x: px + w / 2, y: py + h / 2 });
    });
  };

  const onRideButton = () => {
    if (isRiding) {
      void endRide();
    } else {
      void startRide(selectedPref === 'open' ? 'OPEN' : 'FRIENDS_ONLY');
    }
  };

  const onNavTab = (label: string) => {
    if (label === 'Profile') navigation.navigate('Settings');
    else if (label === 'Routes' && lastSummary)
      navigation.navigate('RideSummary', { summaryId: lastSummary.id });
  };

  // GPS coordinates surfaced in the ride-active panel (formatted "lat, lon").
  const coordLabel = lastLocation ?? 'Acquiring GPS…';

  // Status text under the speaker waveform / in the "clear" state.
  const speakerClear = !isRiding
    ? 'Start your ride to go live'
    : localMuted
      ? 'Mic muted'
      : globalMuted
        ? 'All muted'
        : statusMessage ?? (channelLive ? 'Channel live' : 'Channel clear');

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      <ConcentricRings centreX={centre.x} centreY={centre.y} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top > 0 ? 14 : 46 }]}>
          <Text style={styles.headerTitle}>{isOpen ? 'Open Comms' : 'Group: Crew'}</Text>
          <View
            style={[
              styles.helmetChip,
              {
                borderColor: helmetConnected ? accent.dim : 'rgba(255,255,255,0.08)',
                backgroundColor: helmetConnected ? accent.dim : 'rgba(255,255,255,0.04)',
              },
            ]}
          >
            <Text
              style={[
                styles.helmetChipText,
                { color: helmetConnected ? accent.base : 'rgba(255,255,255,0.3)' },
              ]}
            >
              {helmetConnected ? 'Intercom' : 'Phone audio'}
            </Text>
          </View>
        </View>

        {/* Mode toggle (locked while riding) */}
        <View style={styles.toggleWrap}>
          <View style={styles.toggle}>
            {(['open', 'group'] as Mode[]).map((m) => {
              const active = mode === m;
              const segAccent = m === 'open' ? '#FF5500' : '#FFAA00';
              return (
                <Pressable
                  key={m}
                  onPress={() => !isRiding && setSelectedPref(m)}
                  disabled={isRiding}
                  style={[
                    styles.toggleSeg,
                    { backgroundColor: active ? segAccent : 'transparent', opacity: isRiding && !active ? 0.4 : 1 },
                  ]}
                >
                  <Text
                    style={[styles.toggleText, { color: active ? '#000' : 'rgba(255,255,255,0.28)' }]}
                  >
                    {m}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Radar area */}
        <View style={styles.radarArea}>
          <View ref={radarRef} onLayout={onRadarLayout} style={styles.radar}>
            {isRiding &&
              radarSize > 0 &&
              riders.map(({ riderId, rider }) => (
                <RiderDot key={riderId} rider={rider} radarSize={radarSize} accent={accent} />
              ))}
            <CentreBubble riding={isRiding} accent={accent} />
          </View>

          {/* Rider count */}
          <View style={styles.countRow}>
            <View
              style={[
                styles.countDot,
                {
                  backgroundColor: isRiding ? accent.base : 'rgba(255,255,255,0.18)',
                  shadowColor: accent.base,
                  shadowOpacity: isRiding ? 1 : 0,
                  shadowRadius: isRiding ? 8 : 0,
                  elevation: isRiding ? 4 : 0,
                },
              ]}
            />
            <Text style={styles.countText}>
              {isRiding
                ? `${riders.length} ${isOpen ? 'riders in range' : 'in group'}`
                : 'not broadcasting'}
            </Text>
          </View>

          {/* Active channel / transmission bar */}
          <View
            style={[
              styles.speakerBar,
              { borderColor: transmitting ? accent.dim : 'rgba(255,255,255,0.06)' },
            ]}
          >
            {transmitting ? (
              <>
                <Waveform accent={accent.base} level={micLevel} />
                <View style={styles.flexShrink}>
                  <Text style={[styles.speakerHandle, { color: accent.base }]} numberOfLines={1}>
                    {username.trim() || 'You'}
                  </Text>
                  <Text style={styles.speakerSub} numberOfLines={1}>
                    {connectedPeerIds.length > 0
                      ? `Live · ${connectedPeerIds.length} connected`
                      : 'Live · waiting for peers'}
                  </Text>
                  <Text style={styles.coords} numberOfLines={1}>
                    {coordLabel}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.flexShrink}>
                <Text style={styles.speakerClearText} numberOfLines={2}>
                  {speakerClear}
                </Text>
                {isRiding ? (
                  <Text style={styles.coords} numberOfLines={1}>
                    {coordLabel}
                  </Text>
                ) : null}
              </View>
            )}
          </View>

        </View>

        {/* Start / End ride */}
        <View style={styles.buttonStrip}>
          <RideButton
            riding={isRiding}
            initialising={initialising}
            disabled={!isRiding && !canStart}
            accent={accent}
            onPress={onRideButton}
          />
        </View>

        {/* Bottom nav */}
        <View style={[styles.nav, { paddingBottom: insets.bottom > 0 ? 4 : 14 }]}>
          {NAV_TABS.map((tab) => (
            <Pressable key={tab.label} style={styles.navTab} onPress={() => onNavTab(tab.label)}>
              <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
                <Path
                  d={tab.d}
                  stroke={tab.active ? accent.base : 'rgba(255,255,255,0.2)'}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              <Text
                style={[
                  styles.navLabel,
                  { color: tab.active ? accent.base : 'rgba(255,255,255,0.2)' },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

/* ----- Centre bubble ----- */
function CentreBubble({ riding, accent }: { riding: boolean; accent: ReturnType<typeof accentFor> }) {
  const bob = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    bob.value = withDelay(
      500,
      withRepeat(withSequence(withTiming(-7, { duration: 1600 }), withTiming(0, { duration: 1600 })), -1),
    );
  }, [bob]);

  useEffect(() => {
    if (riding) {
      pulse.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
    } else {
      pulse.value = withTiming(0, { duration: 300 });
    }
  }, [pulse, riding]);

  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    shadowRadius: interpolate(pulse.value, [0, 1], [12, 30]),
    elevation: riding ? interpolate(pulse.value, [0, 1], [6, 14]) : 0,
  }));

  return (
    <Animated.View style={[styles.centreWrap, bobStyle]}>
      <Animated.View
        style={[
          styles.centreBubble,
          {
            backgroundColor: riding ? accent.base : COLORS.innerA,
            borderColor: riding ? accent.base : 'rgba(255,255,255,0.11)',
            shadowColor: accent.base,
            shadowOpacity: riding ? 0.85 : 0,
          },
          glowStyle,
        ]}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path d={HELMET_PATH} fill={riding ? '#000' : 'rgba(255,255,255,0.55)'} />
        </Svg>
      </Animated.View>
      <Text style={[styles.centreLabel, { color: riding ? accent.base : 'rgba(255,255,255,0.28)' }]}>
        {riding ? 'On Air' : 'You'}
      </Text>
    </Animated.View>
  );
}

/* ----- Waveform (amplitude driven by live mic level) ----- */
function Waveform({ accent, level }: { accent: string; level: SharedValue<number> }) {
  return (
    <View style={styles.waveform}>
      {WAVE_BARS.map((h, i) => (
        <WaveBar key={i} base={h} duration={(0.5 + i * 0.07) * 1000} color={accent} level={level} />
      ))}
    </View>
  );
}

function WaveBar({
  base,
  duration,
  color,
  level,
}: {
  base: number;
  duration: number;
  color: string;
  level: SharedValue<number>;
}) {
  const osc = useSharedValue(0);
  useEffect(() => {
    osc.value = withRepeat(withTiming(1, { duration }), -1, true);
  }, [osc, duration]);
  const style = useAnimatedStyle(() => {
    const lift = base + 9 * osc.value;
    const scale = 0.4 + 0.6 * level.value; // quiet -> short bars, loud -> full height
    return { height: Math.max(3, lift * scale) };
  });
  return <Animated.View style={[styles.waveBar, style, { backgroundColor: color }]} />;
}

/* ----- Ride button ----- */
function RideButton({
  riding,
  initialising,
  disabled,
  accent,
  onPress,
}: {
  riding: boolean;
  initialising: boolean;
  disabled: boolean;
  accent: ReturnType<typeof accentFor>;
  onPress: () => void;
}) {
  const p = useSharedValue(riding ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(riding ? 1 : 0, { duration: 200 });
  }, [p, riding]);

  const shellStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(p.value, [0, 1], ['rgba(255,255,255,0.09)', accent.base]),
    shadowColor: accent.base,
    shadowOpacity: interpolate(p.value, [0, 1], [0, 0.5]),
    shadowRadius: interpolate(p.value, [0, 1], [0, 32]),
    elevation: interpolate(p.value, [0, 1], [0, 8]),
  }));
  const gradientStyle = useAnimatedStyle(() => ({ opacity: p.value }));

  const label = initialising ? 'Starting…' : riding ? 'End Ride' : 'Start Ride';

  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ opacity: disabled ? 0.5 : 1 }}>
      <Animated.View style={[styles.rideButton, shellStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.rideGradientWrap, gradientStyle]}>
          <LinearGradient
            colors={[`${accent.base}22`, `${accent.base}08`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        {riding ? (
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Rect x={4} y={4} width={16} height={16} rx={2} fill={accent.base} />
          </Svg>
        ) : (
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M5 3l14 9-14 9V3z" fill="rgba(255,255,255,0.4)" />
          </Svg>
        )}
        <Text style={[styles.rideText, { color: riding ? accent.base : 'rgba(255,255,255,0.38)' }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  safe: { flex: 1 },
  flexShrink: { flexShrink: 1 },

  header: {
    paddingHorizontal: 24,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: FONT,
    fontSize: 30,
    color: '#fff',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  helmetChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 12,
  },
  helmetChipText: { fontFamily: FONT, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase' },

  toggleWrap: { paddingHorizontal: 24, paddingBottom: 18 },
  toggle: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(12,12,12,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  toggleSeg: { flex: 1, paddingVertical: 9, borderRadius: 7, alignItems: 'center' },
  toggleText: { fontFamily: FONT, fontSize: 12, letterSpacing: 1.8, textTransform: 'uppercase' },

  radarArea: { flex: 1, paddingHorizontal: 24, alignItems: 'center' },
  radar: { width: '100%', maxWidth: 320, aspectRatio: 1, alignSelf: 'center' },

  centreWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -28,
    marginLeft: -28,
    width: 56,
    alignItems: 'center',
  },
  centreBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
  },
  centreLabel: { marginTop: 5, fontFamily: FONT, fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase' },

  countRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 14 },
  countDot: { width: 6, height: 6, borderRadius: 3, shadowOffset: { width: 0, height: 0 } },
  countText: {
    fontFamily: FONT,
    fontSize: 11,
    letterSpacing: 1.6,
    color: 'rgba(255,255,255,0.25)',
    textTransform: 'uppercase',
  },

  speakerBar: {
    width: '100%',
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(12,12,12,0.85)',
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2.5, height: 18 },
  waveBar: { width: 2.5, borderRadius: 2 },
  speakerHandle: { fontFamily: FONT, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  speakerSub: {
    fontFamily: FONT,
    fontSize: 9,
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.25)',
    textTransform: 'uppercase',
  },
  speakerClearText: {
    fontFamily: FONT,
    fontSize: 11,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.18)',
    textTransform: 'uppercase',
  },
  coords: {
    marginTop: 3,
    fontFamily: FONT,
    fontSize: 10,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.32)',
  },

  buttonStrip: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 12, backgroundColor: 'rgba(12,12,12,0.95)' },
  rideButton: {
    width: '100%',
    height: 64,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.03)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
  },
  rideGradientWrap: { borderRadius: 14, overflow: 'hidden' },
  rideText: { fontFamily: FONT, fontSize: 17, letterSpacing: 2.4, textTransform: 'uppercase' },

  nav: {
    height: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    backgroundColor: 'rgba(12,12,12,0.95)',
  },
  navTab: { alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8 },
  navLabel: { fontFamily: FONT, fontSize: 9, letterSpacing: 1.1, textTransform: 'uppercase' },
});
