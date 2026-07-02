import React from 'react';
import { StyleSheet, View } from 'react-native';

const RING_SPACING = 44;
const RING_COUNT = 10;
const BASE_OPACITY = 0.55;
const DECAY = 0.5;

interface Props {
  /** Absolute X of the radar's midpoint, in the coordinate space of this layer's parent. */
  centreX: number;
  /** Absolute Y of the radar's midpoint, in the coordinate space of this layer's parent. */
  centreY: number;
}

/**
 * Full-bleed concentric rings rendered behind every other element. Each ring is
 * an absolutely positioned circle centred on the radar's midpoint, so the larger
 * rings extend freely behind the header and toggle (they are not clipped to the
 * radar square). Opacity decays 50% per ring outward. Static — no animation.
 */
function ConcentricRings({ centreX, centreY }: Props) {
  // Nothing to draw until the radar has been measured.
  if (centreX <= 0 || centreY <= 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: RING_COUNT }).map((_, i) => {
        // Drop the innermost ring; every other ring keeps its exact radius/opacity.
        if (i === 0) return null;
        const radius = (i + 1) * RING_SPACING;
        const diam = radius * 2;
        const opacity = BASE_OPACITY * Math.pow(DECAY, i);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: centreX - radius,
              top: centreY - radius,
              width: diam,
              height: diam,
              borderRadius: radius,
              borderWidth: 1,
              borderColor: `rgba(255,255,255,${opacity.toFixed(3)})`,
            }}
          />
        );
      })}
    </View>
  );
}

export default React.memo(ConcentricRings);
