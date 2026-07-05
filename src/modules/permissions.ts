import { Linking, PermissionsAndroid, Platform } from 'react-native';

/**
 * Thin wrapper over Android runtime permissions for the Settings status panel and
 * troubleshooting. iOS returns 'unavailable' (handled by its own prompts).
 */
export type PermState = 'granted' | 'denied' | 'unavailable';
export type PermKey = 'location' | 'microphone' | 'notifications';

export const PERM_LABELS: Record<PermKey, string> = {
  location: 'Location',
  microphone: 'Microphone',
  notifications: 'Notifications',
};

type AndroidPermission = Parameters<typeof PermissionsAndroid.check>[0];

const androidPerm = (key: PermKey): AndroidPermission | undefined => {
  const P = PermissionsAndroid.PERMISSIONS as Record<string, AndroidPermission>;
  if (key === 'location') return P.ACCESS_FINE_LOCATION;
  if (key === 'microphone') return P.RECORD_AUDIO;
  return P.POST_NOTIFICATIONS; // undefined on Android < 13 → treated as granted
};

export async function checkPermission(key: PermKey): Promise<PermState> {
  if (Platform.OS !== 'android') return 'unavailable';
  const perm = androidPerm(key);
  if (!perm) return 'granted';
  return (await PermissionsAndroid.check(perm)) ? 'granted' : 'denied';
}

export async function checkAllPermissions(): Promise<Record<PermKey, PermState>> {
  const keys: PermKey[] = ['location', 'microphone', 'notifications'];
  const entries = await Promise.all(keys.map(async (k) => [k, await checkPermission(k)] as const));
  return Object.fromEntries(entries) as Record<PermKey, PermState>;
}

/**
 * Request a permission. If Android won't prompt again ("Don't ask again"), fall
 * back to opening the app's system settings so the user can flip it manually.
 */
export async function requestPermission(key: PermKey): Promise<PermState> {
  if (Platform.OS !== 'android') return 'unavailable';
  const perm = androidPerm(key);
  if (!perm) return 'granted';
  const res = await PermissionsAndroid.request(perm);
  if (res === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    void Linking.openSettings();
  }
  return 'denied';
}
