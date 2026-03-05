import test from 'node:test';
import assert from 'node:assert/strict';
import { configurePresenceStore, getChannelForRider, upsertPresence } from './presenceStore';
import geohash from 'ngeohash';

test('assigns stable channel for two nearby open riders', async () => {
  await configurePresenceStore();

  await upsertPresence({ riderId: 'r1', lat: 37.7749, lon: -122.4194, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'r2', lat: 37.77495, lon: -122.41945, rideMode: 'OPEN', timestamp: Date.now() });

  const c1 = await getChannelForRider('r1');
  const c2 = await getChannelForRider('r2');

  assert.ok(c1);
  assert.equal(c1, c2);
  assert.match(c1!, /^channel-/);
});

test('friends-only rider does not match open riders', async () => {
  await configurePresenceStore();

  await upsertPresence({ riderId: 'f1', lat: 37.78, lon: -122.42, rideMode: 'FRIENDS_ONLY', timestamp: Date.now() });
  await upsertPresence({ riderId: 'o1', lat: 37.78, lon: -122.42, rideMode: 'OPEN', timestamp: Date.now() });

  const cFriends = await getChannelForRider('f1');
  assert.equal(cFriends, null);
});

function approxDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findClosePointsAcrossGeohashBoundary(): { a: { lat: number; lon: number }; b: { lat: number; lon: number } } {
  const base = { lat: 37.7749, lon: -122.4194 };
  const baseHash = geohash.encode(base.lat, base.lon, 7);

  for (let i = 1; i <= 200; i += 1) {
    const delta = i * 0.000005;
    for (const dLat of [-delta, 0, delta]) {
      for (const dLon of [-delta, 0, delta]) {
        if (dLat === 0 && dLon === 0) continue;
        const candidate = { lat: base.lat + dLat, lon: base.lon + dLon };
        const hash = geohash.encode(candidate.lat, candidate.lon, 7);
        if (hash === baseHash) continue;
        if (approxDistanceMeters(base.lat, base.lon, candidate.lat, candidate.lon) < 150) {
          return { a: base, b: candidate };
        }
      }
    }
  }

  throw new Error('Could not find nearby points in different geohash cells for test');
}

test('matches riders within 150m even when in adjacent geohash cells', async () => {
  await configurePresenceStore();
  const { a, b } = findClosePointsAcrossGeohashBoundary();

  await upsertPresence({ riderId: 'g1', lat: a.lat, lon: a.lon, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'g2', lat: b.lat, lon: b.lon, rideMode: 'OPEN', timestamp: Date.now() });

  const c1 = await getChannelForRider('g1');
  const c2 = await getChannelForRider('g2');

  assert.ok(c1, 'riders within 150m should be paired');
  assert.equal(c1, c2);
});
