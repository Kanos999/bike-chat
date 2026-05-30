import test from 'node:test';
import assert from 'node:assert/strict';
import { configurePresenceStore, getChannelForRider, getChannelSnapshotForRider, upsertPresence } from './presenceStore';
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

test('does not match riders farther than 150m apart', async () => {
  await configurePresenceStore();

  await upsertPresence({ riderId: 'near-1', lat: 37.7749, lon: -122.4194, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'far-1', lat: 37.7767, lon: -122.4194, rideMode: 'OPEN', timestamp: Date.now() });

  assert.equal(await getChannelForRider('near-1'), null);
  assert.equal(await getChannelForRider('far-1'), null);
});

test('matches transitive nearby riders into one stable channel', async () => {
  await configurePresenceStore();

  await upsertPresence({ riderId: 'chain-a', lat: 37.7749, lon: -122.4194, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'chain-b', lat: 37.7757, lon: -122.4194, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'chain-c', lat: 37.7765, lon: -122.4194, rideMode: 'OPEN', timestamp: Date.now() });

  const c1 = await getChannelForRider('chain-a');
  const c2 = await getChannelForRider('chain-b');
  const c3 = await getChannelForRider('chain-c');

  assert.ok(c1);
  assert.equal(c1, c2);
  assert.equal(c2, c3);
});

test('friends-only riders in the same crew match each other when nearby', async () => {
  await configurePresenceStore();

  await upsertPresence({ riderId: 'friend-a', lat: 37.7749, lon: -122.4194, rideMode: 'FRIENDS_ONLY', timestamp: Date.now(), groupId: 'crew-x' });
  await upsertPresence({ riderId: 'friend-b', lat: 37.77495, lon: -122.41945, rideMode: 'FRIENDS_ONLY', timestamp: Date.now(), groupId: 'crew-x' });

  const c1 = await getChannelForRider('friend-a');
  const c2 = await getChannelForRider('friend-b');

  assert.ok(c1);
  assert.equal(c1, c2);
});

// ~metres of latitude offset (1 deg lat ~= 111,320 m).
const latOffset = (meters: number) => meters / 111_320;
const BASE = { lat: 37.7749, lon: -122.4194 };

test('open rider does not get a (phantom) channel with a friends-only rider', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  await upsertPresence({ riderId: 'o1', lat: BASE.lat, lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'f1', lat: BASE.lat, lon: BASE.lon, rideMode: 'FRIENDS_ONLY', timestamp: Date.now() });

  // Symmetric: neither side is matched (no one-sided channel).
  assert.equal(await getChannelForRider('o1'), null);
  assert.equal(await getChannelForRider('f1'), null);
});

test('hysteresis: fresh riders only pair within the join radius (150m), not the leave radius', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  await upsertPresence({ riderId: 'a', lat: BASE.lat, lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'b', lat: BASE.lat + latOffset(250), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });

  // 250m apart with no prior link -> must not pair (join radius is 150m).
  assert.equal(await getChannelForRider('a'), null);
});

test('hysteresis: a paired rider is retained out to the leave radius (300m), then drops', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  await upsertPresence({ riderId: 'a', lat: BASE.lat, lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'b', lat: BASE.lat + latOffset(100), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });

  const paired = await getChannelForRider('a'); // tick 1: within join
  assert.ok(paired, 'should pair within join radius');

  // tick 2: drift to 250m — past join, within leave, previously linked -> retained
  await upsertPresence({ riderId: 'b', lat: BASE.lat + latOffset(250), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  const retained = await getChannelForRider('a');
  assert.equal(retained, paired, 'should stay paired (and keep the same channel) within leave radius');

  // tick 3: drift past 300m -> the link finally drops
  await upsertPresence({ riderId: 'b', lat: BASE.lat + latOffset(350), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  assert.equal(await getChannelForRider('a'), null, 'should drop past leave radius');
});

test('sticky channel id: a moving group keeps the same channel as it travels', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  await upsertPresence({ riderId: 'lead', lat: BASE.lat, lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'wing', lat: BASE.lat + latOffset(100), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });

  const id1 = await getChannelForRider('lead');
  assert.ok(id1);

  // Both ride ~1.1km north together (many geohash cells), staying ~100m apart.
  const shift = latOffset(1_100);
  await upsertPresence({ riderId: 'lead', lat: BASE.lat + shift, lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'wing', lat: BASE.lat + shift + latOffset(100), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });

  const id2 = await getChannelForRider('lead');
  assert.equal(id2, id1, 'channel id must persist as the group moves (no mid-ride rejoin)');
});

test('merge keeps the older group id', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  // Group 1 forms first.
  await upsertPresence({ riderId: 'p1', lat: BASE.lat, lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'p2', lat: BASE.lat + latOffset(100), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  const olderId = await getChannelForRider('p1');
  assert.ok(olderId);

  // A separate pair forms ~1km away (its own, newer id).
  const far = latOffset(1_000);
  await upsertPresence({ riderId: 'q1', lat: BASE.lat + far, lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'q2', lat: BASE.lat + far + latOffset(100), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  const newerId = await getChannelForRider('q1');
  assert.ok(newerId);
  assert.notEqual(newerId, olderId);

  // The q-pair rides into the p-group -> one component; the older id wins.
  await upsertPresence({ riderId: 'q1', lat: BASE.lat + latOffset(120), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'q2', lat: BASE.lat + latOffset(140), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });

  assert.equal(await getChannelForRider('q1'), olderId, 'merged group adopts the senior channel id');
  assert.equal(await getChannelForRider('p1'), olderId);
});

test('heading gate: two moving riders heading opposite directions do not pair', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  // Same coords, both at 80 km/h, headings 180° apart (oncoming traffic crossing).
  await upsertPresence({
    riderId: 'north', lat: BASE.lat, lon: BASE.lon, rideMode: 'OPEN',
    timestamp: Date.now(), headingDeg: 0, speedKph: 80,
  });
  await upsertPresence({
    riderId: 'south', lat: BASE.lat, lon: BASE.lon, rideMode: 'OPEN',
    timestamp: Date.now(), headingDeg: 180, speedKph: 80,
  });

  assert.equal(await getChannelForRider('north'), null);
  assert.equal(await getChannelForRider('south'), null);
});

test('heading gate: two moving riders heading the same way pair (small bearing diff)', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  await upsertPresence({
    riderId: 'lead', lat: BASE.lat, lon: BASE.lon, rideMode: 'OPEN',
    timestamp: Date.now(), headingDeg: 90, speedKph: 80,
  });
  await upsertPresence({
    riderId: 'wing', lat: BASE.lat + latOffset(80), lon: BASE.lon, rideMode: 'OPEN',
    timestamp: Date.now(), headingDeg: 110, speedKph: 80,
  });

  const c = await getChannelForRider('lead');
  assert.ok(c);
  assert.equal(await getChannelForRider('wing'), c);
});

test('heading gate is suppressed when at least one rider is stationary', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  // Parked rider with no meaningful heading; a moving friend pulls alongside.
  await upsertPresence({
    riderId: 'parked', lat: BASE.lat, lon: BASE.lon, rideMode: 'OPEN',
    timestamp: Date.now(), headingDeg: 0, speedKph: 0,
  });
  await upsertPresence({
    riderId: 'arriving', lat: BASE.lat + latOffset(50), lon: BASE.lon, rideMode: 'OPEN',
    timestamp: Date.now(), headingDeg: 180, speedKph: 60,
  });

  const c = await getChannelForRider('parked');
  assert.ok(c, 'parked + arriving must pair even with very different reported headings');
});

test('heading gate does not break a paired group when one rider briefly diverges', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  // Two riders cruising together, ~100m apart, same direction -> linked.
  const opts = (id: string, latShift: number, heading: number) => ({
    riderId: id, lat: BASE.lat + latOffset(latShift), lon: BASE.lon, rideMode: 'OPEN' as const,
    timestamp: Date.now(), headingDeg: heading, speedKph: 90,
  });
  await upsertPresence(opts('lead', 0, 90));
  await upsertPresence(opts('wing', 100, 95));
  const id = await getChannelForRider('lead');
  assert.ok(id);

  // wing momentarily turns hard (e.g. weaving / lane change) but is still within
  // 200m of lead. The retain-edge ignores heading -> they stay on the same channel.
  await upsertPresence(opts('wing', 200, 170));
  assert.equal(await getChannelForRider('lead'), id);
});

test('channel snapshot includes nearby member identities and distance', async () => {
  await configurePresenceStore();

  await upsertPresence({ riderId: 'snap-a', lat: 37.7749, lon: -122.4194, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'snap-b', lat: 37.77495, lon: -122.41945, rideMode: 'OPEN', timestamp: Date.now() });

  const snapshot = await getChannelSnapshotForRider('snap-a');

  assert.ok(snapshot.channelId);
  assert.equal(snapshot.members.length, 1);
  assert.equal(snapshot.members[0].riderId, 'snap-b');
  assert.equal(snapshot.members[0].rideMode, 'OPEN');
  assert.ok(snapshot.members[0].distanceMeters > 0);
});

test('FRIENDS_ONLY riders in different crews do not pair', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  await upsertPresence({ riderId: 'a', lat: BASE.lat, lon: BASE.lon, rideMode: 'FRIENDS_ONLY', timestamp: Date.now(), groupId: 'crew-a' });
  await upsertPresence({ riderId: 'b', lat: BASE.lat + latOffset(50), lon: BASE.lon, rideMode: 'FRIENDS_ONLY', timestamp: Date.now(), groupId: 'crew-b' });

  assert.equal(await getChannelForRider('a'), null);
});

test('FRIENDS_ONLY riders with no crew do not pair', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  await upsertPresence({ riderId: 'a', lat: BASE.lat, lon: BASE.lon, rideMode: 'FRIENDS_ONLY', timestamp: Date.now() });
  await upsertPresence({ riderId: 'b', lat: BASE.lat + latOffset(50), lon: BASE.lon, rideMode: 'FRIENDS_ONLY', timestamp: Date.now() });

  assert.equal(await getChannelForRider('a'), null);
});

test('a block severs the link in both directions', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  await upsertPresence({ riderId: 'a', lat: BASE.lat, lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now(), blockedRiderIds: ['b'] });
  await upsertPresence({ riderId: 'b', lat: BASE.lat + latOffset(50), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });

  assert.equal(await getChannelForRider('a'), null);
  assert.equal(await getChannelForRider('b'), null);
});

test('a transitively-linked blocked rider makes both decline the channel', async () => {
  await configurePresenceStore(undefined, { recomputeIntervalMs: 0 });

  // a blocks c, but b sits between them so union-find pulls all three into one
  // component. The hard block guarantee means a and c never share audio, so both
  // decline the channel; b (no blocks) keeps one.
  await upsertPresence({ riderId: 'a', lat: BASE.lat, lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now(), blockedRiderIds: ['c'] });
  await upsertPresence({ riderId: 'b', lat: BASE.lat + latOffset(40), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });
  await upsertPresence({ riderId: 'c', lat: BASE.lat + latOffset(80), lon: BASE.lon, rideMode: 'OPEN', timestamp: Date.now() });

  assert.equal(await getChannelForRider('a'), null);
  assert.equal(await getChannelForRider('c'), null);
  assert.ok((await getChannelSnapshotForRider('b')).channelId, 'b has no block, keeps a channel');
});
