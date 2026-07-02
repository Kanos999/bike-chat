import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveKitConfigFromEnv } from './livekit';

function clearLiveKitEnv(): void {
  delete process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
  delete process.env.LIVEKIT_TOKEN_TTL_SECONDS;
}

function decodeJwtPayload(token: string): Record<string, any> {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

test('disabled and generate() throws when LiveKit env is missing', async () => {
  clearLiveKitEnv();
  const livekit = createLiveKitConfigFromEnv();
  assert.equal(livekit.enabled, false);
  assert.equal(livekit.url, null);
  await assert.rejects(() => livekit.generate('channel-abc', 'rider-1'), /not configured/);
});

test('mints a room-scoped join token for the rider', async () => {
  clearLiveKitEnv();
  process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'devkey';
  process.env.LIVEKIT_API_SECRET = 'devsecret_at_least_32_chars_long_xxxx';
  process.env.LIVEKIT_TOKEN_TTL_SECONDS = '1800';

  const livekit = createLiveKitConfigFromEnv();
  assert.equal(livekit.enabled, true);
  assert.equal(livekit.url, 'wss://example.livekit.cloud');

  const result = await livekit.generate('channel-r3gx-1', 'rider-1');
  assert.equal(result.url, 'wss://example.livekit.cloud');
  assert.equal(result.room, 'channel-r3gx-1');
  assert.equal(result.identity, 'rider-1');
  assert.equal(result.ttl, 1800);
  assert.ok(result.token.split('.').length === 3, 'token should be a JWT');

  const payload = decodeJwtPayload(result.token);
  assert.equal(payload.iss, 'devkey', 'issuer is the API key');
  assert.equal(payload.sub, 'rider-1', 'subject is the identity');
  assert.equal(payload.video.room, 'channel-r3gx-1');
  assert.equal(payload.video.roomJoin, true);
  assert.equal(payload.video.canPublish, true);
  assert.equal(payload.video.canSubscribe, true);
  // Expiry is roughly ttl seconds out (allow a few seconds of skew).
  const now = Math.floor(Date.now() / 1000);
  assert.ok(payload.exp > now + 1700 && payload.exp <= now + 1800 + 5, 'exp ~ttl in the future');

  clearLiveKitEnv();
});

test('token identities differ per rider so participants are distinct', async () => {
  clearLiveKitEnv();
  process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'devkey';
  process.env.LIVEKIT_API_SECRET = 'devsecret_at_least_32_chars_long_xxxx';

  const livekit = createLiveKitConfigFromEnv();
  const a = await livekit.generate('channel-x', 'rider-a');
  const b = await livekit.generate('channel-x', 'rider-b');
  assert.equal(decodeJwtPayload(a.token).sub, 'rider-a');
  assert.equal(decodeJwtPayload(b.token).sub, 'rider-b');
  assert.notEqual(a.token, b.token);

  clearLiveKitEnv();
});
