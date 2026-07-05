/**
 * Deep links for crew invites. A crew's QR / share link encodes
 * `bikechat://join?code=ABC123`; scanning it with the phone camera opens the app
 * (via the AndroidManifest intent filter) and App.tsx joins the crew by code.
 */
export const APP_SCHEME = 'bikechat';

export function crewJoinUrl(code: string): string {
  return `${APP_SCHEME}://join?code=${encodeURIComponent(code.trim())}`;
}

/** Extract a crew join code from a deep link, or null if it isn't a join link. */
export function parseJoinCode(url: string | null | undefined): string | null {
  if (!url || !/(^|\/\/|[?&/])join/i.test(url)) return null;
  const m = url.match(/[?&]code=([^&#]+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).trim().toUpperCase() || null;
  } catch {
    return m[1].trim().toUpperCase() || null;
  }
}
