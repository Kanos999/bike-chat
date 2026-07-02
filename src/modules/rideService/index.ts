import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

/**
 * Wrapper around the native Android `RideService` foreground-service module.
 *
 * The foreground service keeps the app process (and therefore GPS, BLE, the
 * presence WebSocket and WebRTC audio) alive while a ride is active and the app
 * is backgrounded or the screen is off. All calls are best-effort: if the native
 * module is missing (e.g. iOS, or an old build) the ride still works while the
 * app is in the foreground.
 */
type RideServiceNative = {
  start(): Promise<boolean>;
  refresh(): Promise<boolean>;
  stop(): Promise<boolean>;
};

const native: RideServiceNative | undefined =
  Platform.OS === 'android' ? NativeModules.RideService : undefined;

/**
 * Ask for POST_NOTIFICATIONS (Android 13+) so the ongoing ride notification is
 * visible. The foreground service runs regardless, but Android may suppress its
 * notification without this grant.
 */
async function requestNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const perm = (PermissionsAndroid.PERMISSIONS as Record<string, string>)
    .POST_NOTIFICATIONS;
  if (!perm) return; // Android < 13: notifications allowed by default.
  try {
    await PermissionsAndroid.request(perm as any);
  } catch {
    /* best-effort */
  }
}

export const rideForegroundService = {
  isAvailable(): boolean {
    return !!native;
  },

  /** Start the ride foreground service. Requests notification permission first. */
  async start(): Promise<void> {
    if (!native) return;
    await requestNotificationPermission();
    try {
      await native.start();
    } catch {
      /* best-effort: ride still works in the foreground */
    }
  },

  /**
   * Re-issue the service so it can widen its foregroundServiceType once a new
   * permission (e.g. microphone, granted when joining the voice channel) is held.
   */
  async refresh(): Promise<void> {
    if (!native) return;
    try {
      await native.refresh();
    } catch {
      /* best-effort */
    }
  },

  async stop(): Promise<void> {
    if (!native) return;
    try {
      await native.stop();
    } catch {
      /* best-effort */
    }
  },
};
