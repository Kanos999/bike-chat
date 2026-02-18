import React from 'react';
import {
  Button,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../app/App';
import { useAppStore } from '../state/store';
import type { RideSummary } from '../modules/analytics';

const CHART_MAX_POINTS = 40;
const CHART_HEIGHT = 120;
const screenWidth = Dimensions.get('window').width;
const chartWidth = screenWidth - 48;

/** Downsample to at most CHART_MAX_POINTS for chart display. */
function downsample(
  points: Array<{ timestamp: number }>,
  values: number[],
): { labels: string[]; data: number[] } {
  if (points.length === 0 || values.length === 0) return { labels: [], data: [] };
  const start = points[0].timestamp;
  const step = Math.max(1, Math.floor(points.length / CHART_MAX_POINTS));
  const labels: string[] = [];
  const data: number[] = [];
  for (let i = 0; i < points.length && i < values.length; i += step) {
    labels.push(`${((points[i].timestamp - start) / 1000).toFixed(0)}s`);
    data.push(values[i]);
  }
  return { labels, data };
}

/** Simple bar sparkline using only View - no native SVG/chart lib. */
function SimpleBarChart({
  data,
  title,
  suffix,
  color,
}: {
  data: number[];
  title: string;
  suffix: string;
  color: string;
}) {
  if (data.length < 2) return <Text style={styles.chartPlaceholder}>Not enough data</Text>;
  const max = Math.max(...data, 1);
  const barWidth = Math.max(2, (chartWidth - (data.length - 1) * 2) / data.length);

  return (
    <View style={styles.chartSection}>
      <Text style={styles.chartTitle}>
        {title} ({suffix})
      </Text>
      <View style={[styles.chartContainer, { height: CHART_HEIGHT }]}>
        {data.map((v, i) => (
          <View
            key={i}
            style={{
              width: barWidth,
              height: Math.max(2, (v / max) * (CHART_HEIGHT - 4)),
              backgroundColor: color,
              borderRadius: 1,
              marginRight: i < data.length - 1 ? 2 : 0,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function VelocityChart({ summary }: { summary: RideSummary }) {
  const points = summary.velocityProfile;
  if (points.length === 0) return <Text style={styles.chartPlaceholder}>No velocity data</Text>;
  const { data } = downsample(
    points,
    points.map((p) => p.speedKph),
  );
  return <SimpleBarChart data={data} title="Velocity" suffix="kph" color="#4fc3f7" />;
}

function LeanChart({ summary }: { summary: RideSummary }) {
  const points = summary.leanProfile;
  if (points.length === 0) return <Text style={styles.chartPlaceholder}>No lean data</Text>;
  const { data } = downsample(
    points,
    points.map((p) => p.leanDeg),
  );
  return <SimpleBarChart data={data} title="Lean angle" suffix="deg" color="#81c784" />;
}

function StatsBlock({ summary }: { summary: RideSummary }) {
  const s = summary.stats;
  return (
    <View style={styles.statsBlock}>
      <Text style={styles.statsTitle}>Ride stats</Text>
      <View style={styles.statsRow}>
        <Text>Max speed: {s.maxSpeedKph.toFixed(1)} kph</Text>
      </View>
      <View style={styles.statsRow}>
        <Text>Avg speed: {s.avgSpeedKph.toFixed(1)} kph</Text>
      </View>
      <View style={styles.statsRow}>
        <Text>Max lean L: {s.maxLeanLeftDeg.toFixed(1)}°</Text>
      </View>
      <View style={styles.statsRow}>
        <Text>Max lean R: {s.maxLeanRightDeg.toFixed(1)}°</Text>
      </View>
      <View style={styles.statsRow}>
        <Text>Distance: {s.distanceKm.toFixed(2)} km</Text>
      </View>
      <View style={styles.statsRow}>
        <Text>Time moving: {s.timeMovingSec.toFixed(0)}s</Text>
      </View>
      <View style={styles.statsRow}>
        <Text>Time stopped: {s.timeStoppedSec.toFixed(0)}s</Text>
      </View>
    </View>
  );
}

const RideSummaryScreen = ({
  navigation,
}: StackScreenProps<RootStackParamList, 'RideSummary'>) => {
  const lastSummary = useAppStore((state) => state.lastSummary);

  if (!lastSummary) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Ride summary</Text>
        <Text style={styles.empty}>No ride data</Text>
        <View style={styles.buttonRow}>
          <Button title="Back to Home" onPress={() => navigation.navigate('Home')} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Ride summary</Text>
      <StatsBlock summary={lastSummary} />
      <VelocityChart summary={lastSummary} />
      <LeanChart summary={lastSummary} />
      <View style={styles.buttonRow}>
        <Button title="Back to Home" onPress={() => navigation.navigate('Home')} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  scroll: {
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  empty: {
    marginBottom: 24,
    color: '#666',
  },
  statsBlock: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  statsRow: {
    paddingVertical: 4,
  },
  chartSection: {
    marginBottom: 24,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 4,
  },
  chartPlaceholder: {
    color: '#666',
    paddingVertical: 16,
  },
  buttonRow: {
    marginTop: 16,
  },
});

export default RideSummaryScreen;
