import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { config } from '../../config';
import { APP_SCHEME } from '../deepLink';

const SESSION_KEY = 'bikechat.supabase.session';
const OAUTH_CALLBACK_URL = `${APP_SCHEME}://auth/callback`;

export type OAuthProvider = 'google' | 'facebook';
export type IdTokenProvider = 'google';

export interface SupabaseUser {
  id: string;
  email?: string;
  phone?: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: SupabaseUser;
}

function getHeaders(accessToken?: string): Record<string, string> {
  const apiKey = config.supabaseAnonKey;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.apikey = apiKey;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

function baseAuthUrl(): string {
  const url = config.supabaseUrl;
  if (!url) throw new Error('Missing Supabase URL. Set __BikeChatSupabaseUrl.');
  if (!config.supabaseAnonKey) throw new Error('Missing Supabase anon key. Set __BikeChatSupabaseAnonKey.');
  return `${url.replace(/\/$/, '')}/auth/v1`;
}

function oauthAuthorizeUrl(provider: OAuthProvider): string {
  const params = [
    ['provider', provider],
    ['redirect_to', OAUTH_CALLBACK_URL],
  ]
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${baseAuthUrl()}/authorize?${params}`;
}

async function saveSession(session: SupabaseSession | null): Promise<void> {
  if (!session) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function parseAuthParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const chunks: string[] = [];
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');

  if (queryIndex >= 0) {
    const end = hashIndex >= 0 && hashIndex > queryIndex ? hashIndex : url.length;
    chunks.push(url.slice(queryIndex + 1, end));
  }
  if (hashIndex >= 0) chunks.push(url.slice(hashIndex + 1));

  for (const chunk of chunks) {
    for (const pair of chunk.split('&')) {
      if (!pair) continue;
      const equalsIndex = pair.indexOf('=');
      const rawKey = equalsIndex >= 0 ? pair.slice(0, equalsIndex) : pair;
      const rawValue = equalsIndex >= 0 ? pair.slice(equalsIndex + 1) : '';
      try {
        const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
        params[key] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
      } catch {
        params[rawKey] = rawValue;
      }
    }
  }

  return params;
}

function parseExpiry(params: Record<string, string>): number | undefined {
  const expiresAt = Number(params.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt > 0) return Math.floor(expiresAt);

  const expiresIn = Number(params.expires_in);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    return Math.floor(Date.now() / 1000) + Math.floor(expiresIn);
  }

  return undefined;
}

export async function loadStoredSession(): Promise<SupabaseSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SupabaseSession;
  } catch {
    return null;
  }
}

async function requestSession(path: string, body: object): Promise<SupabaseSession> {
  const url = `${baseAuthUrl()}${path}`;
  const controller = new AbortController();
  const timeoutMs = 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const isAbort =
      (error instanceof Error && error.name === 'AbortError') ||
      String((error as any)?.name ?? '').toLowerCase().includes('abort');
    const baseMessage = isAbort
      ? `Timed out after ${timeoutMs}ms reaching Supabase.`
      : 'Network request failed reaching Supabase.';

    // React Native often throws TypeError('Network request failed') with no extra details.
    // Provide likely causes that match real-world RN failures.
    throw new Error(
      `${baseMessage} URL: ${url}. ` +
        'Check device/emulator internet access, VPN/proxy/firewall, and correct system time (TLS).'
    );
  } finally {
    clearTimeout(timeout);
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  if (!res.ok) {
    const message =
      (typeof data.msg === 'string' && data.msg) ||
      (typeof (data as any).error_description === 'string' && (data as any).error_description) ||
      (typeof (data as any).error === 'string' && (data as any).error) ||
      `Supabase auth failed (${res.status})`;
    throw new Error(message);
  }
  if (!data.access_token || !data.refresh_token || !data.user) {
    console.log('Unexpected Supabase auth response:', data);
    throw new Error('Unexpected Supabase auth response');
  }
  return data as unknown as SupabaseSession;
}

async function requestJson(path: string, body: object): Promise<Record<string, unknown>> {
  const url = `${baseAuthUrl()}${path}`;
  const controller = new AbortController();
  const timeoutMs = 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const isAbort =
      (error instanceof Error && error.name === 'AbortError') ||
      String((error as any)?.name ?? '').toLowerCase().includes('abort');
    const baseMessage = isAbort
      ? `Timed out after ${timeoutMs}ms reaching Supabase.`
      : 'Network request failed reaching Supabase.';
    throw new Error(
      `${baseMessage} URL: ${url}. ` +
        'Check device/emulator internet access, VPN/proxy/firewall, and correct system time (TLS).'
    );
  } finally {
    clearTimeout(timeout);
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }

  if (!res.ok) {
    const message =
      (typeof data.msg === 'string' && data.msg) ||
      (typeof (data as any).error_description === 'string' && (data as any).error_description) ||
      (typeof (data as any).error === 'string' && (data as any).error) ||
      `Supabase request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}

async function requestUser(accessToken: string): Promise<SupabaseUser> {
  const res = await fetch(`${baseAuthUrl()}/user`, {
    method: 'GET',
    headers: getHeaders(accessToken),
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }

  if (!res.ok) {
    const message =
      (typeof data.msg === 'string' && data.msg) ||
      (typeof (data as any).error_description === 'string' && (data as any).error_description) ||
      (typeof (data as any).error === 'string' && (data as any).error) ||
      `Supabase user lookup failed (${res.status})`;
    throw new Error(message);
  }

  if (typeof data.id !== 'string') throw new Error('Unexpected Supabase user response');
  return {
    id: data.id,
    email: typeof data.email === 'string' ? data.email : undefined,
    phone: typeof data.phone === 'string' ? data.phone : undefined,
  };
}

export async function startOAuthSignIn(provider: OAuthProvider): Promise<void> {
  await Linking.openURL(oauthAuthorizeUrl(provider));
}

export async function completeOAuthSignIn(url: string): Promise<SupabaseSession | null> {
  if (!url.startsWith(`${APP_SCHEME}://`)) return null;
  const params = parseAuthParams(url);
  const hasAuthPayload =
    Boolean(params.access_token) || Boolean(params.refresh_token) || Boolean(params.error) || Boolean(params.error_code);
  if (!hasAuthPayload) return null;

  if (params.error || params.error_code) {
    throw new Error(params.error_description || params.error || params.error_code || 'OAuth sign-in failed');
  }

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  if (!accessToken || !refreshToken) throw new Error('OAuth sign-in did not return a Supabase session');

  const session: SupabaseSession = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: parseExpiry(params),
    user: await requestUser(accessToken),
  };
  await saveSession(session);
  return session;
}

export async function signInWithIdToken(
  provider: IdTokenProvider,
  idToken: string
): Promise<SupabaseSession> {
  const normalizedToken = idToken.trim();
  if (!normalizedToken) throw new Error('Missing Google ID token');

  const session = await requestSession('/token?grant_type=id_token', {
    provider,
    id_token: normalizedToken,
  });
  await saveSession(session);
  return session;
}

export async function requestSmsOtp(phone: string): Promise<void> {
  const normalized = phone.trim();
  if (!normalized) throw new Error('Enter a phone number');
  // Supabase expects E.164 format ideally (e.g. +61400111222)
  await requestJson('/otp', {
    phone: normalized,
    options: { shouldCreateUser: true },
  });
}

export async function verifySmsOtp(phone: string, code: string): Promise<SupabaseSession> {
  const normalizedPhone = phone.trim();
  const normalizedCode = code.trim();
  if (!normalizedPhone) throw new Error('Enter a phone number');
  if (!normalizedCode) throw new Error('Enter the SMS code');
  const session = await requestSession('/verify', {
    type: 'sms',
    phone: normalizedPhone,
    token: normalizedCode,
  });
  await saveSession(session);
  return session;
}

export async function refreshSession(refreshToken: string): Promise<SupabaseSession> {
  const session = await requestSession('/token?grant_type=refresh_token', { refresh_token: refreshToken });
  await saveSession(session);
  return session;
}

export async function getValidSession(): Promise<SupabaseSession | null> {
  const stored = await loadStoredSession();
  if (!stored) return null;
  const now = Math.floor(Date.now() / 1000);
  if (stored.expires_at && stored.expires_at > now + 20) return stored;
  if (!stored.refresh_token) return null;
  try {
    return await refreshSession(stored.refresh_token);
  } catch {
    return null;
  }
}

export async function signOut(session: SupabaseSession | null): Promise<void> {
  if (session?.access_token) {
    await fetch(`${baseAuthUrl()}/logout`, {
      method: 'POST',
      headers: getHeaders(session.access_token),
    }).catch(() => {});
  }
  await saveSession(null);
}
