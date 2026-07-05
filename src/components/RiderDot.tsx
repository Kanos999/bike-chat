import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Accent, FONT } from './bikerTheme';
import AudioBars from './AudioBars';

export interface Rider {
  id: number;
  handle: string;
  angle: number; // degrees, 0 = top, clockwise
  dist: string;
  speaking: boolean;
}

// Fixed-width anchor so the bubble centres exactly on its radar point regardless
// of how wide the handle label renders.
const ANCHOR_W = 80;
const BUBBLE = 38;

interface Props {
  rider: Rider;
  /** Measured pixel width of the (square) radar container. */
  radarSize: number;
  accent: Accent;
}

function RiderDot({ rider, radarSize, accent }: Props) {
  const { speaking } = rider;

  // Position around the radar: angle 0 = top, clockwise. Radius = 34% of width.
  const rad = ((rider.angle - 90) * Math.PI) / 180;
  const centre = radarSize / 2;
  const ringRadius = 0.34 * radarSize;
  const x = centre + ringRadius * Math.cos(rad);
  const y = centre + ringRadius * Math.sin(rad);

  // Independent vertical float on a wrapper View, separate from the positioning
  // View, so the placement transform never conflicts with the float transform.
  const floatY = useSharedValue(0);
  useEffect(() => {
    const duration = (2.4 + rider.id * 0.41) * 1000;
    const delay = rider.id * 0.67 * 1000;
    floatY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-9, { duration, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
  }, [floatY, rider.id]);

  // Speaking pulse: glow radius oscillates tight (7) <-> wide (18) every 500ms.
  const glow = useSharedValue(7);
  useEffect(() => {
    if (speaking) {
      glow.value = withRepeat(withTiming(18, { duration: 500 }), -1, true);
    } else {
      glow.value = withTiming(7, { duration: 250 });
    }
  }, [glow, speaking]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  const bubbleGlowStyle = useAnimatedStyle(() => ({
    shadowRadius: glow.value,
    elevation: speaking ? glow.value / 2 : 0,
  }));

  return (
    <View
      pointerEvents="none"
      style={[
        styles.positioner,
        { transform: [{ translateX: x - ANCHOR_W / 2 }, { translateY: y - BUBBLE / 2 }] },
      ]}
    >
      <Animated.View style={[styles.floatWrap, floatStyle]}>
        <Animated.View
          style={[
            styles.bubble,
            {
              backgroundColor: speaking ? accent.base : '#181818',
              borderColor: speaking ? accent.base : 'rgba(255,255,255,0.13)',
              shadowColor: accent.base,
              shadowOpacity: speaking ? 0.9 : 0,
            },
            bubbleGlowStyle,
          ]}
        >
          <AudioBars size={19} color={speaking ? '#000' : 'rgba(255,255,255,0.62)'} />
        </Animated.View>
        <Text
          numberOfLines={1}
          style={[styles.handle, { color: speaking ? accent.base : 'rgba(255,255,255,0.44)' }]}
        >
          {rider.handle}
        </Text>
        <Text style={styles.dist}>{rider.dist}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: ANCHOR_W,
    alignItems: 'center',
  },
  floatWrap: {
    alignItems: 'center',
  },
  bubble: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
  },
  handle: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: FONT,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  dist: {
    marginTop: 1,
    fontSize: 10,
    fontFamily: FONT,
    color: 'rgba(255,255,255,0.44)',
  },
});

export default React.memo(RiderDot);
