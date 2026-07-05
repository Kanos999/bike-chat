import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../../config';

const SESSION_KEY = 'bikechat.supabase.session';

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

async function saveSession(session: SupabaseSession | null): Promise<void> {
  if (!session) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
