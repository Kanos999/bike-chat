import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../../config';

const SESSION_KEY = 'bikechat.supabase.session';

export interface SupabaseUser {
  id: string;
  email?: string;
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

async function loadStoredSession(): Promise<SupabaseSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SupabaseSession;
  } catch {
    return null;
  }
}

async function requestSession(path: string, body: object): Promise<SupabaseSession> {
  const res = await fetch(`${baseAuthUrl()}${path}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.msg === 'string' ? data.msg : `Supabase auth failed (${res.status})`;
    throw new Error(message);
  }
  if (!data.access_token || !data.refresh_token || !data.user) {
    throw new Error('Unexpected Supabase auth response');
  }
  return data as unknown as SupabaseSession;
}

export async function signInWithEmail(email: string, password: string): Promise<SupabaseSession> {
  const session = await requestSession('/token?grant_type=password', { email, password });
  await saveSession(session);
  return session;
}

export async function signUpWithEmail(email: string, password: string): Promise<SupabaseSession> {
  const session = await requestSession('/signup', { email, password });
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
