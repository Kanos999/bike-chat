// Design tokens for the ported biker-comms main screen.
// Bebas Neue is linked via react-native.config.js + `npx react-native-asset`;
// the family name resolves to the ttf base filename on Android.
export const FONT = 'BebasNeue-Regular';

export const COLORS = {
  bg: '#060606',
  surface: '#0c0c0c',
  innerA: '#161616',
  innerB: '#181818',
};

// Helmet glyph shared by the centre bubble and rider dots.
export const HELMET_PATH = 'M12 2C7 2 3 6.5 3 11v3h2l1 4h12l1-4h2v-3C21 6.5 17 2 12 2z';

export type Mode = 'open' | 'group';

export interface Accent {
  base: string; // solid accent
  glow: string; // accent @ 33% alpha — used for shadows
  dim: string; // accent @ ~9% alpha — used for faint tints/gradients
}

export function accentFor(mode: Mode): Accent {
  return mode === 'open'
    ? { base: '#FF5500', glow: '#FF550055', dim: '#FF550018' }
    : { base: '#FFAA00', glow: '#FFAA0055', dim: '#FFAA0018' };
}
