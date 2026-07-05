import React from 'react';
import Svg, { Rect } from 'react-native-svg';

/**
 * 3-bar audio / equalizer glyph used inside the radar bubbles (replaces the old
 * helmet icon). Drawn in a 24x24 box so it drops in wherever an icon `size` fits.
 * Short–tall–short bars, vertically centred on the box.
 */
export default function AudioBars({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3.5} y={8} width={3.6} height={8} rx={1.8} fill={color} />
      <Rect x={10.2} y={3.5} width={3.6} height={17} rx={1.8} fill={color} />
      <Rect x={16.9} y={8} width={3.6} height={8} rx={1.8} fill={color} />
    </Svg>
  );
}
