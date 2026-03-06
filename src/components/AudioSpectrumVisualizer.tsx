import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const DEFAULT_BAR_COUNT = 18;
const DEFAULT_MIN_BAR_HEIGHT = 4;
const DEFAULT_MAX_BAR_HEIGHT = 36;
const DEFAULT_HEIGHT = 40;
const DEFAULT_GAP = 6;

/** When audio input is ~0, keep the component alive with subtle motion. */
const IDLE_AMPLITUDE = 0.08;

type Props = {
  level: number;
  muted: boolean;
  barColor?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
  height?: number;
  barCount?: number;
  minBarHeight?: number;
  maxBarHeight?: number;
  gap?: number;
  cornerRadius?: number;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length !== 6) return null;
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  if ([r, g, b].some((c) => Number.isNaN(c))) return null;
  return { r, g, b };
}

function rgba(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha)})`;
}

function mix(hexA: string, hexB: string, t: number) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const tt = clamp01(t);
  const r = Math.round(a.r + (b.r - a.r) * tt);
  const g = Math.round(a.g + (b.g - a.g) * tt);
  const bch = Math.round(a.b + (b.b - a.b) * tt);
  return `rgb(${r}, ${g}, ${bch})`;
}

function makeBaseGradient(barColor: string, muted: boolean) {
  if (muted) {
    return ['rgba(180, 170, 160, 0.22)', 'rgba(180, 170, 160, 0.12)', 'rgba(180, 170, 160, 0.06)'];
  }

  const low = rgba(mix(barColor, '#000000', 0.35), 0.95);
  const mid = rgba(barColor, 0.9);
  const hi = rgba(mix(barColor, '#ffffff', 0.35), 0.95);
  return [low, mid, hi];
}

function barParams(index: number) {
  // Deterministic pseudo-random per index.
  const x = Math.sin((index + 1) * 999.123) * 10000;
  const frac = x - Math.floor(x);
  const wobble = 0.55 + frac * 0.6; // 0.55–1.15
  const phase = index * 0.65 + frac * 1.8;
  const shimmerOffset = frac;
  return { wobble, phase, shimmerOffset };
}

function SpectrumBar({
  index,
  barCount,
  levelSV,
  idleSV,
  shimmerSV,
  mutedSV,
  muted,
  minBarHeight,
  maxBarHeight,
  cornerRadius,
  gap,
  barColor,
}: {
  index: number;
  barCount: number;
  levelSV: SharedValue<number>;
  idleSV: SharedValue<number>;
  shimmerSV: SharedValue<number>;
  mutedSV: SharedValue<number>;
  muted: boolean;
  minBarHeight: number;
  maxBarHeight: number;
  cornerRadius: number;
  gap: number;
  barColor: string;
}) {
  const { wobble, phase, shimmerOffset } = useMemo(() => barParams(index), [index]);

  const heightStyle = useAnimatedStyle(() => {
    const muted = mutedSV.value >= 0.5;
    const base = muted ? 0 : levelSV.value;
    const idle = muted
      ? 0
      : IDLE_AMPLITUDE * (0.5 + 0.5 * Math.sin((idleSV.value + phase) * Math.PI * 2));
    const effective = base > 0.01 ? base : idle;

    const wave = 0.35 + 0.65 * Math.max(0, Math.sin((idleSV.value + phase) * Math.PI * 2));
    const h = minBarHeight + effective * (maxBarHeight - minBarHeight) * wave * wobble;
    return { height: Math.max(minBarHeight, h) };
  }, [minBarHeight, maxBarHeight]);

  const shimmerStyle = useAnimatedStyle(() => {
    const muted = mutedSV.value >= 0.5;
    const travel = 26;
    const t = (shimmerSV.value + shimmerOffset) % 1;
    const x = interpolate(t, [0, 1], [-travel, travel]);
    return {
      transform: [{ translateX: x }],
      opacity: muted ? 0.08 : 0.24,
    };
  });

  const baseColors = makeBaseGradient(barColor, false);
  const mutedColors = makeBaseGradient(barColor, true);

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          borderRadius: cornerRadius,
          minHeight: minBarHeight,
          marginLeft: index === 0 ? 0 : gap / 2,
          marginRight: index === barCount - 1 ? 0 : gap / 2,
        },
        heightStyle,
      ]}
    >
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={muted ? mutedColors : baseColors}
          start={{ x: 0.15, y: 1 }}
          end={{ x: 0.2, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

export function AudioSpectrumVisualizer({
  level,
  muted,
  barColor = '#ff6600',
  style,
  className,
  height = DEFAULT_HEIGHT,
  barCount = DEFAULT_BAR_COUNT,
  minBarHeight = DEFAULT_MIN_BAR_HEIGHT,
  maxBarHeight = DEFAULT_MAX_BAR_HEIGHT,
  gap = DEFAULT_GAP,
  cornerRadius = 4,
}: Props) {
  const levelSV = useSharedValue(0);
  const idleSV = useSharedValue(0);
  const shimmerSV = useSharedValue(0);
  const mutedSV = useSharedValue(muted ? 1 : 0);

  useEffect(() => {
    mutedSV.value = withTiming(muted ? 1 : 0, { duration: 140 });
  }, [muted, mutedSV]);

  useEffect(() => {
    const target = muted ? 0 : clamp01(level);
    levelSV.value = withTiming(target, {
      duration: 90,
      easing: Easing.out(Easing.cubic),
    });
  }, [level, muted, levelSV]);

  useEffect(() => {
    idleSV.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.linear }),
      -1,
      false
    );
    shimmerSV.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.linear }),
      -1,
      false
    );
  }, [idleSV, shimmerSV]);

  const bars = useMemo(() => Array.from({ length: barCount }, (_, i) => i), [barCount]);

  return (
    <View className={className} style={[styles.root, style]}>
      <View style={[styles.row, { height }]}>
        {bars.map((i) => (
          <SpectrumBar
            key={i}
            index={i}
            barCount={barCount}
            levelSV={levelSV}
            idleSV={idleSV}
            shimmerSV={shimmerSV}
            mutedSV={mutedSV}
            muted={muted}
            minBarHeight={minBarHeight}
            maxBarHeight={maxBarHeight}
            cornerRadius={cornerRadius}
            gap={gap}
            barColor={barColor}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  bar: {
    flex: 1,
    overflow: 'hidden',
    minHeight: DEFAULT_MIN_BAR_HEIGHT,
  },
});
