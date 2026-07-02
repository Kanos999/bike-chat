import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { createTurnConfigFromEnv } from './turn';

function clearTurnEnv(): void {
  delete process.env.TURN_SECRET;
  delete process.env.TURN_URLS;
  delete process.env.STUN_URLS;
  delete process.env.TURN_TTL_SECONDS;
}

test('STUN-only when no TURN secret/urls configured', () => {
  clearTurnEnv();
  const turn = createTurnConfigFromEnv();
  assert.equal(turn.enabled, false);
  const { iceServers } = turn.generate('rider-1');
  assert.equal(iceServers.length, 1);
  assert.deepEqual(iceServers[0].urls, ['stun:stun.l.google.com:19302']);
  assert.equal(iceServers[0].username, undefined);
});

test('generates coturn REST credentials matching the shared secret', () => {
  clearTurnEnv();
  process.env.TURN_SECRET = 'topsecret';
  process.env.TURN_URLS = 'turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp';
  process.env.TURN_TTL_SECONDS = '3600';
  const turn = createTurnConfigFromEnv();
  assert.equal(turn.enabled, true);

  const { iceServers, ttl } = turn.generate('rider-1');
  assert.equal(ttl, 3600);
  const turnServer = iceServers.find((s) => s.urls[0].startsWith('turn'));
  assert.ok(turnServer, 'expected a TURN entry');
  assert.deepEqual(turnServer!.urls, [
    'turn:turn.example.com:3478?transport=udp',
    'turns:turn.example.com:5349?transport=tcp',
  ]);

  // username must be "<expiry>:<id>" with a future expiry.
  const [expiryStr, id] = turnServer!.username!.split(':');
  assert.equal(id, 'rider-1');
  const expiry = parseInt(expiryStr, 10);
  assert.ok(expiry > Math.floor(Date.now() / 1000), 'expiry should be in the future');

  // credential must be the base64 HMAC-SHA1 of the username under the secret.
  const expected = createHmac('sha1', 'topsecret').update(turnServer!.username!).digest('base64');
  assert.equal(turnServer!.credential, expected);

  clearTurnEnv();
});

test('sanitizes rider identifier used in the username', () => {
  clearTurnEnv();
  process.env.TURN_SECRET = 's';
  process.env.TURN_URLS = 'turn:turn.example.com:3478';
  const turn = createTurnConfigFromEnv();
  const { iceServers } = turn.generate('weird id/with:chars');
  const turnServer = iceServers.find((s) => s.urls[0].startsWith('turn'))!;
  const id = turnServer.username!.split(':')[1];
  assert.equal(id, 'weirdidwithchars');
  clearTurnEnv();
});
