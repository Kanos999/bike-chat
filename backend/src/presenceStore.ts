import type { PresenceUpdate, StoredPresence } from './types';

const TTL_MS = 90_000;
/** Proximity radius in meters; riders within this distance are matched for voice. */
const RADIUS_METERS = 150;

const store = new Map<string, { data: StoredPresence; expiresAt: number }>();

/** Haversine distance in meters between two WGS84 points. */
function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function upsertPresence(update: PresenceUpdate): void {
  const stored: StoredPresence = { ...update };
  store.set(update.riderId, {
    data: stored,
    expiresAt: Date.now() + TTL_MS,
  });
}

/** Returns rider IDs that are within RADIUS_METERS of (lat, lon) and match rideMode. */
function getRiderIdsWithinRadius(
  lat: number,
  lon: number,
  rideMode: 'OPEN' | 'FRIENDS_ONLY',
  now: number
): string[] {
  const out: string[] = [];
  for (const [riderId, entry] of store) {
    if (entry.expiresAt < now) {
      store.delete(riderId);
      continue;
    }
    if (rideMode === 'FRIENDS_ONLY' && entry.data.rideMode !== 'FRIENDS_ONLY')
      continue;
    const d = distanceMeters(lat, lon, entry.data.lat, entry.data.lon);
    if (d <= RADIUS_METERS) out.push(riderId);
  }
  return out;
}

/** Stable channel id for a set of riders (same set => same id). */
function channelIdForRiders(riderIds: string[]): string {
  const sorted = [...riderIds].sort();
  return `channel-${sorted.join(',')}`;
}

export function getChannelForRider(riderId: string): string | null {
  const now = Date.now();
  const entry = store.get(riderId);
  if (!entry || entry.expiresAt < now) return null;
  const { lat, lon, rideMode } = entry.data;
  const mode = rideMode as 'OPEN' | 'FRIENDS_ONLY';
  const nearby = getRiderIdsWithinRadius(lat, lon, mode, now);
  if (nearby.length < 2) return null;
  return channelIdForRiders(nearby);
}

export function pruneExpired(): void {
  const now = Date.now();
  for (const [riderId, entry] of store) {
    if (entry.expiresAt < now) store.delete(riderId);
  }
}

let pruneInterval: NodeJS.Timeout | null = null;

export function startPruneInterval(): void {
  if (pruneInterval) return;
  pruneInterval = setInterval(pruneExpired, 30_000);
}
