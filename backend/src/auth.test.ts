import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthContextFromEnv } from './auth';

test('shared token authorizes matching bearer token', async () => {
  process.env.AUTH_TOKEN = 'secret';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  const auth = createAuthContextFromEnv();

  const ok = await auth.authorizeHttp({ headers: { authorization: 'Bearer secret' } } as never);
  const bad = await auth.authorizeHttp({ headers: { authorization: 'Bearer nope' } } as never);
  assert.equal(ok, true);
  assert.equal(bad, false);
});

test('supabase mode uses remote validation', async () => {
  delete process.env.AUTH_TOKEN;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon';

  const originalFetch = global.fetch;
  global.fetch = (async () => ({ ok: true } as Response)) as unknown as typeof fetch;

  const auth = createAuthContextFromEnv();
  const ok = await auth.authorizeWsToken('supabase.jwt');
  assert.equal(ok, true);

  global.fetch = originalFetch;
});
