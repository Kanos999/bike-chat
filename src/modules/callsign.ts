/**
 * Callsign (username) rules shared by the setup screen and Settings. The callsign
 * doubles as the rider's matcher identity (riderId), is stored server-side with a
 * UNIQUE constraint, and is shown to other riders — so it needs to be short, stable,
 * and typeable.
 */
export const CALLSIGN_MIN = 3;
export const CALLSIGN_MAX = 20;
const CALLSIGN_RE = /^[A-Za-z0-9_-]+$/;

/** Returns an error string if invalid, or null if the callsign is acceptable. */
export function validateCallsign(raw: string): string | null {
  const name = raw.trim();
  if (name.length < CALLSIGN_MIN) return `At least ${CALLSIGN_MIN} characters.`;
  if (name.length > CALLSIGN_MAX) return `At most ${CALLSIGN_MAX} characters.`;
  if (!CALLSIGN_RE.test(name)) return 'Letters, numbers, dash and underscore only.';
  return null;
}
