import { Vibration } from 'react-native';

/**
 * Vibration companion for the rider-join alert.
 *
 * The audible chime (assets/chime.mp3 → android res/raw/chime.mp3) is played
 * natively by BleModule.playJoinTone on the VOICE_COMMUNICATION usage so it rides
 * the SCO link into the helmet. This Vibration buzz fires alongside it (and is the
 * sole alert on platforms without the native chime, e.g. iOS until added). The
 * `kind` chooses the buzz pattern; the chime itself is the same clip for every
 * non-"off" style.
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
