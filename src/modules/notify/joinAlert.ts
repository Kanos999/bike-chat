import { Vibration } from 'react-native';

/**
 * Alert played when a new rider joins your channel mid-ride.
 *
 * NOTE: React Native ships no audio playback and this project currently has no
 * sound library (offline install of `react-native-sound` is unavailable), so the
 * alert is delivered via the built-in Vibration API. To add an audible tone
 * later: `npm i react-native-sound`, drop short clips in
 * android/app/src/main/res/raw + the iOS bundle, and play the file matching
 * `kind` inside `playJoinAlert` (keep the vibration as a fallback).
 */
export type JoinAlert = 'off' | 'short' | 'double' | 'long';

export const DEFAULT_JOIN_ALERT: JoinAlert = 'short';

export const JOIN_ALERTS: { id: JoinAlert; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'short', label: 'Short' },
  { id: 'double', label: 'Double' },
  { id: 'long', label: 'Long' },
];

const PATTERNS: Record<Exclude<JoinAlert, 'off'>, number | number[]> = {
  short: 120,
  double: [0, 100, 90, 100],
  long: 420,
};

export function isJoinAlert(value: unknown): value is JoinAlert {
  return value === 'off' || value === 'short' || value === 'double' || value === 'long';
}

export function playJoinAlert(kind: JoinAlert): void {
  if (kind === 'off') return;
  try {
    Vibration.vibrate(PATTERNS[kind]);
  } catch {
    /* vibration unavailable on this device — ignore */
  }
}
