import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ScreenScaffold from '../components/ScreenScaffold';
import { Card, GhostButton, Muted, SectionLabel } from '../components/ui';
import { accentFor, FONT } from '../components/bikerTheme';
import type { AppNavigation } from '../app/App';
import { getRide, type RideRow } from '../modules/groups/supabaseData';
import type { RideSummary } from '../modules/analytics';
import { useAppStore } from '../state/store';

const accent = accentFor('open');

const CHART_MAX_POINTS = 40;
const CHART_HEIGHT = 120;
// Body padding (24*2) + card padding (16*2).
const chartWidth = Dimensions.get('window').width - 80;

function downsample(points: Array<{ timestamp: number }>, values: number[]): number[] {
  if (points.length === 0 || values.length === 0) return [];
  const step = Math.max(1, Math.floor(points.length / CHART_MAX_POINTS));
  const data: number[] = [];
  for (let i = 0; i < points.length && i < values.length; i += step) data.push(values[i]);
  return data;
}

function formatRideDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Seconds → "1h 05m", "23m 40s", or "40s" — much clearer than a raw "1420 s".
function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

function BarChart({ data, title, suffix, color }: { data: number[]; title: string; suffix: string; color: string }) {
  return (
    <Card>
      <SectionLabel>
        {title} ({suffix})
      </SectionLabel>
      {data.length < 2 ? (
        <View style={styles.emptyChart}>
          <Muted>Not enough data</Muted>
        </View>
      ) : (
        <View style={[styles.chart, { height: CHART_HEIGHT }]}>
          {(() => {
            const max = Math.max(...data, 1);
            const barWidth = Math.max(2, (chartWidth - (data.length - 1) * 2) / data.length);
            return data.map((v, i) => (
              <View
                key={i}
                style={{
                  width: barWidth,
                  height: Math.max(2, (v / max) * (CHART_HEIGHT - 8)),
                  backgroundColor: color,
                  borderRadius: 1,
                  marginRight: i < data.length - 1 ? 2 : 0,
                }}
              />
            ));
          })()}
        </View>
      )}
    </Card>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function RideSummaryScreen({ navigation }: { navigation: AppNavigation }) {
  const rides = useAppStore((s) => s.rides);
  const ridesLoading = useAppStore((s) => s.ridesLoading);
  const loadRides = useAppStore((s) => s.loadRides);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void loadRides();
  }, [loadRides]);

  // While a ride detail is open, the Android hardware back button closes it (back
  // to the history list) instead of leaving the Routes tab. Only active when this
  // tab is focused and a detail is showing.
  useFocusEffect(
    useCallback(() => {
      if (!selectedId) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setSelectedId(null);
        return true;
      });
      return () => sub.remove();
    }, [selectedId]),
  );

  const selected = selectedId ? rides.find((r) => r.id === selectedId) ?? null : null;

  if (selected) {
    return <RideDetail ride={selected} navigation={navigation} onBack={() => setSelectedId(null)} />;
  }

  return (
    <ScreenScaffold
      title="Routes"
      navigation={navigation}
      activeTab="Routes"
      accent={accent}
      refreshing={ridesLoading}
      onRefresh={() => void loadRides()}
    >
      <SectionLabel>Ride history</SectionLabel>
      {rides.length === 0 ? (
        <Card>
          <Muted>{ridesLoading ? 'Loading…' : 'No rides yet. Finish a ride to see it here.'}</Muted>
        </Card>
      ) : (
        rides.map((r) => (
          <Pressable key={r.id} onPress={() => setSelectedId(r.id)}>
            <Card>
              <View style={styles.rideRow}>
                <View style={styles.flexShrink}>
                  <Text style={styles.rideDate}>{formatRideDate(r.started_at)}</Text>
                  <Text style={styles.rideSub}>
                    {r.ride_mode === 'FRIENDS_ONLY' ? 'Crew' : 'Open'} · {r.distance_km.toFixed(1)} km · {r.max_speed_kph.toFixed(0)} kph max
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: accent.base }]}>›</Text>
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </ScreenScaffold>
  );
}

function RideDetail({
  ride,
  navigation,
  onBack,
}: {
  ride: RideRow;
  navigation: AppNavigation;
  onBack: () => void;
}) {
  const matchesByRide = useAppStore((s) => s.matchesByRide);
  const loadRideMatches = useAppStore((s) => s.loadRideMatches);
  const friends = useAppStore((s) => s.friends);
  const friendRequests = useAppStore((s) => s.friendRequests);
  const username = useAppStore((s) => s.username);
  const sendFriendRequest = useAppStore((s) => s.sendFriendRequest);
  const deleteRide = useAppStore((s) => s.deleteRide);

  const onDelete = () => {
    Alert.alert('Delete ride', 'Remove this ride from your history? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteRide(ride.id);
          if (!error) onBack();
        },
      },
    ]);
  };

  const [summary, setSummary] = useState<RideSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [requested, setRequested] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoadingSummary(true);
    void getRide(ride.id)
      .then((row) => {
        if (!cancelled) setSummary((row?.summary as RideSummary) ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });
    void loadRideMatches(ride.id);
    return () => {
      cancelled = true;
    };
  }, [ride.id, loadRideMatches]);

  const matched = matchesByRide[ride.id] ?? [];
  // Names already known to us (friends / pending) shouldn't show an Add action.
  const known = new Set<string>([
    username,
    ...friends.map((f) => f.username),
    ...friendRequests.map((r) => r.username),
  ]);

  const velocity = summary ? downsample(summary.velocityProfile, summary.velocityProfile.map((p) => p.speedKph)) : [];
  const lean = summary ? downsample(summary.leanProfile, summary.leanProfile.map((p) => p.leanDeg)) : [];

  const onAdd = (name: string) => {
    void sendFriendRequest(name);
    setRequested((prev) => new Set(prev).add(name));
  };

  return (
    <ScreenScaffold
      title="Ride"
      navigation={navigation}
      activeTab="Routes"
      accent={accent}
      onBack={onBack}
    >
      <Card>
        <SectionLabel>{formatRideDate(ride.started_at)}</SectionLabel>
        <View style={styles.stats}>
          <StatRow label="Mode" value={ride.ride_mode === 'FRIENDS_ONLY' ? 'Crew' : 'Open'} />
          <StatRow label="Max speed" value={`${ride.max_speed_kph.toFixed(1)} kph`} />
          <StatRow label="Avg speed" value={`${ride.avg_speed_kph.toFixed(1)} kph`} />
          <StatRow label="Max lean L" value={`${ride.max_lean_left_deg.toFixed(1)}°`} />
          <StatRow label="Max lean R" value={`${ride.max_lean_right_deg.toFixed(1)}°`} />
          <StatRow label="Distance" value={`${ride.distance_km.toFixed(2)} km`} />
          <StatRow label="Time moving" value={formatDuration(ride.time_moving_sec)} />
          <StatRow label="Time stopped" value={formatDuration(ride.time_stopped_sec)} />
        </View>
      </Card>

      {loadingSummary ? (
        <Card>
          <ActivityIndicator color={accent.base} />
        </Card>
      ) : summary ? (
        <>
          <BarChart data={velocity} title="Velocity" suffix="kph" color={accent.base} />
          <BarChart data={lean} title="Lean angle" suffix="deg" color="#FFAA00" />
        </>
      ) : null}

      <Card>
        <SectionLabel>Riders matched</SectionLabel>
        {matched.length === 0 ? (
          <Muted>You didn't share a channel with anyone on this ride.</Muted>
        ) : (
          matched.map((name) => (
            <View key={name} style={styles.matchRow}>
              <Text style={styles.matchName} numberOfLines={1}>
                {name}
              </Text>
              {known.has(name) ? (
                <Text style={styles.mutedTag}>Friend</Text>
              ) : requested.has(name) ? (
                <Text style={styles.mutedTag}>Requested</Text>
              ) : (
                <Pressable onPress={() => onAdd(name)}>
                  <Text style={[styles.link, { color: accent.base }]}>Add friend</Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </Card>

      <GhostButton label="Delete ride" danger onPress={onDelete} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  rideRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rideDate: { fontFamily: FONT, fontSize: 16, letterSpacing: 0.8, color: '#fff', textTransform: 'uppercase' },
  rideSub: { marginTop: 3, fontFamily: FONT, fontSize: 12, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' },
  chevron: { fontSize: 26, lineHeight: 26 },

  stats: { marginTop: 8 },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  statLabel: { fontFamily: FONT, fontSize: 14, letterSpacing: 1, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' },
  statValue: { fontFamily: FONT, fontSize: 15, letterSpacing: 0.8, color: '#fff', textTransform: 'uppercase' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 14 },
  emptyChart: { paddingVertical: 16 },

  matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, gap: 12 },
  matchName: { flexShrink: 1, fontFamily: FONT, fontSize: 15, letterSpacing: 0.8, color: '#fff', textTransform: 'uppercase' },
  link: { fontFamily: FONT, fontSize: 13, letterSpacing: 1.4, textTransform: 'uppercase' },
  mutedTag: { fontFamily: FONT, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' },
});
