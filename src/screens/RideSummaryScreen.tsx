import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import ScreenScaffold from '../components/ScreenScaffold';
import { Card, Muted, PrimaryButton, SectionLabel } from '../components/ui';
import { accentFor, FONT } from '../components/bikerTheme';
import type { AppNavigation, RootStackParamList } from '../app/App';
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

export default function RideSummaryScreen({
  navigation,
}: {
  navigation: AppNavigation;
  route?: { params?: RootStackParamList['RideSummary'] };
}) {
  const lastSummary = useAppStore((s) => s.lastSummary);

  if (!lastSummary) {
    return (
      <ScreenScaffold title="Routes" navigation={navigation} activeTab="Routes" accent={accent}>
        <Card>
          <SectionLabel>No rides yet</SectionLabel>
          <Muted>Finish a ride to see your speed and lean breakdown here.</Muted>
        </Card>
        <PrimaryButton label="Back to comms" accent={accent} onPress={() => navigation.navigate('Home')} />
      </ScreenScaffold>
    );
  }

  const s = lastSummary.stats;
  const velocity = downsample(lastSummary.velocityProfile, lastSummary.velocityProfile.map((p) => p.speedKph));
  const lean = downsample(lastSummary.leanProfile, lastSummary.leanProfile.map((p) => p.leanDeg));

  return (
    <ScreenScaffold title="Routes" navigation={navigation} activeTab="Routes" accent={accent}>
      <Card>
        <SectionLabel>Ride stats</SectionLabel>
        <View style={styles.stats}>
          <StatRow label="Max speed" value={`${s.maxSpeedKph.toFixed(1)} kph`} />
          <StatRow label="Avg speed" value={`${s.avgSpeedKph.toFixed(1)} kph`} />
          <StatRow label="Max lean L" value={`${s.maxLeanLeftDeg.toFixed(1)}°`} />
          <StatRow label="Max lean R" value={`${s.maxLeanRightDeg.toFixed(1)}°`} />
          <StatRow label="Distance" value={`${s.distanceKm.toFixed(2)} km`} />
          <StatRow label="Time moving" value={`${s.timeMovingSec.toFixed(0)} s`} />
          <StatRow label="Time stopped" value={`${s.timeStoppedSec.toFixed(0)} s`} />
        </View>
      </Card>

      <BarChart data={velocity} title="Velocity" suffix="kph" color={accent.base} />
      <BarChart data={lean} title="Lean angle" suffix="deg" color="#FFAA00" />

      <PrimaryButton label="Back to comms" accent={accent} onPress={() => navigation.navigate('Home')} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  stats: { marginTop: 8 },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  statLabel: { fontFamily: FONT, fontSize: 13, letterSpacing: 1, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' },
  statValue: { fontFamily: FONT, fontSize: 15, letterSpacing: 0.8, color: '#fff', textTransform: 'uppercase' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 14 },
  emptyChart: { paddingVertical: 16 },
});
