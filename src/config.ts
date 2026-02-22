/**
 * App config. For production, replace with react-native-config or similar.
 *
 * - Android emulator: 10.0.2.2 is the emulator's alias for the host machine's localhost.
 * - Physical device: 10.0.2.2 is not your computer. Set __BikeChatApiBaseUrl to your
 *   machine's LAN IP (e.g. http://192.168.1.5:3000) so the device can reach the backend.
 *   Set it in index.js or App.tsx before the app loads, e.g.:
 *   (global as any).__BikeChatApiBaseUrl = 'http://192.168.1.5:3000';
 */
const getDefaultBaseUrl = (): string => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return 'http://192.168.0.79:3000'; // Android emulator → host (fails on physical device)
  }
  return 'https://your-backend.example.com';
};

export const config = {
  /** Base URL for REST API (no trailing slash). */
  get apiBaseUrl(): string {
    return (global as unknown as { __BikeChatApiBaseUrl?: string }).__BikeChatApiBaseUrl ?? getDefaultBaseUrl();
  },
  /** WebSocket URL for signalling (ws:// or wss://). */
  get wsBaseUrl(): string {
    const base = this.apiBaseUrl.replace(/^http/, 'ws');
    return `${base}/ws`;
  },
  /** Set by app init so real voice can get current riderId. */
  riderIdGetter: null as (() => string) | null,
  getRiderId(): string {
    return this.riderIdGetter?.() ?? 'unknown';
  },
};
