import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

const BAR_COUNT = 14;
const BAR_MIN_HEIGHT = 4;
const BAR_MAX_HEIGHT = 32;
const BAR_WIDTH = 4;
const BAR_GAP = 3;

/** When getStats() doesn't provide audioLevel (common on RN), show a subtle idle animation. */
const IDLE_LEVEL_AMPLITUDE = 0.07;

/** Animation frame interval for smooth bars when showing real audio (~30 fps). */
const AUDIO_ANIMATION_INTERVAL_MS = 33;

type Props = {
  level: number;
  muted: boolean;
  barColor?: string;
};

function computeHeights(level: number, phase: number): number[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const variation =
      0.35 + 0.65 * Math.max(0, Math.sin(i * 0.5 + phase));
    const h =
      BAR_MIN_HEIGHT +
      level * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT) * variation;
    return Math.round(h);
  });
}

export function AudioSpectrumVisualizer({
  level,
  muted,
  barColor = '#ff6600',
}: Props) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array(BAR_COUNT).fill(BAR_MIN_HEIGHT)
  );
  const phaseRef = useRef(0);
  const levelRef = useRef(0);

  levelRef.current = muted ? 0 : Math.min(1, Math.max(0, level));

  useEffect(() => {
    if (muted) {
      setHeights(Array(BAR_COUNT).fill(BAR_MIN_HEIGHT));
      return;
    }
    setHeights(computeHeights(levelRef.current, phaseRef.current));
  }, [muted]);

  useEffect(() => {
    if (muted) return;

    const id = setInterval(() => {
      phaseRef.current += 0.4;
      const current = levelRef.current;
      const effectiveLevel =
        current <= 0
          ? IDLE_LEVEL_AMPLITUDE * (0.5 + 0.5 * Math.sin(Date.now() / 400))
          : current;
      setHeights(computeHeights(effectiveLevel, phaseRef.current));
    }, AUDIO_ANIMATION_INTERVAL_MS);

    return () => clearInterval(id);
  }, [muted]);

  return (
    <View className="mt-2.5 mb-1">
      <View className="flex-row items-end justify-center gap-0.5 h-8">
        {heights.map((h, i) => (
          <View
            key={i}
            className="w-1 rounded-sm min-h-1"
            style={{
              height: h,
              backgroundColor: barColor,
            }}
          />
        ))}
      </View>
    </View>
  );
}
