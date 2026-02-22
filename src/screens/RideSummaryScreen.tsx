import React from 'react';
import {
  Button,
  Dimensions,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type { AppNavigation, RootStackParamList } from '../app/App';
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
  if (data.length < 2) return <Text className="text-bike-text-dim py-4 tracking-wide">Not enough data</Text>;
  const max = Math.max(...data, 1);
  const barWidth = Math.max(2, (chartWidth - (data.length - 1) * 2) / data.length);

  return (
    <View className="mb-6">
      <Text className="text-base font-semibold text-bike-orange-muted mb-2 tracking-widest">
        {title} ({suffix})
      </Text>
      <View className="flex-row items-end bg-bike-card rounded-lg p-1 border border-bike-border-orange" style={{ height: CHART_HEIGHT }}>
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
  if (points.length === 0) return <Text className="text-bike-text-dim py-4 tracking-wide">No velocity data</Text>;
  const { data } = downsample(
    points,
    points.map((p) => p.speedKph),
  );
  return <SimpleBarChart data={data} title="Velocity" suffix="kph" color="#ff8833" />;
}

function LeanChart({ summary }: { summary: RideSummary }) {
  const points = summary.leanProfile;
  if (points.length === 0) return <Text className="text-bike-text-dim py-4 tracking-wide">No lean data</Text>;
  const { data } = downsample(
    points,
    points.map((p) => p.leanDeg),
  );
  return <SimpleBarChart data={data} title="Lean angle" suffix="deg" color="#cc7733" />;
}

function StatsBlock({ summary }: { summary: RideSummary }) {
  const s = summary.stats;
  return (
    <View className="mb-6 p-4 bg-bike-card rounded-lg border border-bike-border-orange">
      <Text className="text-base font-semibold text-bike-orange-muted mb-2 tracking-widest">Ride stats</Text>
      <View className="py-1">
        <Text className="text-bike-text text-sm tracking-wide">Max speed: {s.maxSpeedKph.toFixed(1)} kph</Text>
      </View>
      <View className="py-1">
        <Text className="text-bike-text text-sm tracking-wide">Avg speed: {s.avgSpeedKph.toFixed(1)} kph</Text>
      </View>
      <View className="py-1">
        <Text className="text-bike-text text-sm tracking-wide">Max lean L: {s.maxLeanLeftDeg.toFixed(1)}°</Text>
      </View>
      <View className="py-1">
        <Text className="text-bike-text text-sm tracking-wide">Max lean R: {s.maxLeanRightDeg.toFixed(1)}°</Text>
      </View>
      <View className="py-1">
        <Text className="text-bike-text text-sm tracking-wide">Distance: {s.distanceKm.toFixed(2)} km</Text>
      </View>
      <View className="py-1">
        <Text className="text-bike-text text-sm tracking-wide">Time moving: {s.timeMovingSec.toFixed(0)}s</Text>
      </View>
      <View className="py-1">
        <Text className="text-bike-text text-sm tracking-wide">Time stopped: {s.timeStoppedSec.toFixed(0)}s</Text>
      </View>
    </View>
  );
}

const RideSummaryScreen = ({
  navigation,
  route,
}: {
  navigation: AppNavigation;
  route: { params?: RootStackParamList['RideSummary'] };
}) => {
  const lastSummary = useAppStore((state) => state.lastSummary);

  if (!lastSummary) {
    return (
      <View className="flex-1 p-6 justify-center bg-bike-bg">
        <Text className="text-[22px] font-bold mb-4 text-bike-text tracking-wide">Ride summary</Text>
        <Text className="mb-6 text-bike-text-dim tracking-wide">No ride data</Text>
        <View className="mt-4">
          <Button title="Back to Home" onPress={() => navigation.navigate('Home')} color="#cc7733" />
        </View>
      </View>
    );
  }

  return (
    <ScrollView>
      <View className="p-6 pb-12 bg-bike-bg">
        <Text className="text-[22px] font-bold mb-4 text-bike-text tracking-wide">Ride summary</Text>
        <StatsBlock summary={lastSummary} />
        <VelocityChart summary={lastSummary} />
        <LeanChart summary={lastSummary} />
        <View className="mt-4">
          <Button title="Back to Home" onPress={() => navigation.navigate('Home')} color="#cc7733" />
        </View>
      </View>
    </ScrollView>
  );
};

export default RideSummaryScreen;
