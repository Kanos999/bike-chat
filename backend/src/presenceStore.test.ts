import test from 'node:test';
import assert from 'node:assert/strict';
import { configurePresenceStore, getChannelForRider, upsertPresence } from './presenceStore';

test('assigns stable geohash channel for two nearby open riders', async () => {
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
