import { config } from '../../config';

/**
 * Thin PostgREST client for the groups / blocks / profiles tables defined in
 * supabase/schema.sql. Mirrors the raw-fetch style of supabaseAuth.ts (the app
 * has no supabase-js dependency). Every call is authenticated with the rider's
 * Supabase access token, so Row Level Security is what enforces access.
 */

export interface Group {
  id: string;
  name: string;
  join_code: string;
  owner_id: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  member_id: string;
  username: string;
  joined_at: string;
}

export interface Block {
  blocker_id: string;
  blocked_username: string;
  created_at: string;
}

function supabaseAccessToken(): string | null {
  // The matcher's shared AUTH_TOKEN (config.authToken) is not a Supabase JWT, so
  // read the Supabase session token directly — it's the only thing PostgREST + RLS
  // will accept.
  return (
    (global as unknown as { __BikeChatSupabaseAccessToken?: string }).__BikeChatSupabaseAccessToken ?? null
  );
}

function restBase(): { url: string; apiKey: string; token: string } {
  const url = config.supabaseUrl;
  const apiKey = config.supabaseAnonKey;
  const token = supabaseAccessToken();
  if (!url || !apiKey) throw new Error('Supabase is not configured');
  if (!token) throw new Error('Not signed in');
  return { url: url.replace(/\/$/, ''), apiKey, token };
}

async function rest<T>(
  path: string,
  options: { method?: string; body?: unknown; prefer?: string } = {},
): Promise<T> {
  const { url, apiKey, token } = restBase();
  const headers: Record<string, string> = {
    apikey: apiKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (options.prefer) headers.Prefer = options.prefer;

  const res = await fetch(`${url}/rest/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await res.text();
  if (!res.ok) {
    let message = `Supabase request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { message?: string; hint?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

/** RPCs return either the composite row or an array of it depending on PostgREST. */
function first<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

export async function fetchMyGroups(): Promise<Group[]> {
  return rest<Group[]>('/groups?select=*&order=created_at.asc');
}

export async function createGroup(name: string): Promise<Group> {
  const result = await rest<Group | Group[]>('/rpc/create_group', {
    method: 'POST',
    body: { p_name: name },
  });
  return first(result);
}

export async function joinGroupByCode(code: string): Promise<Group> {
  const result = await rest<Group | Group[]>('/rpc/join_group_by_code', {
    method: 'POST',
    body: { p_code: code },
  });
  return first(result);
}

export async function leaveGroup(groupId: string): Promise<void> {
  // RLS scopes the delete to our own membership row, so filtering by group is enough.
  await rest<void>(`/group_members?group_id=eq.${encodeURIComponent(groupId)}`, { method: 'DELETE' });
}

export async function renameGroup(groupId: string, name: string): Promise<void> {
  await rest<void>(`/groups?id=eq.${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    body: { name },
  });
}

export async function deleteGroup(groupId: string): Promise<void> {
  await rest<void>(`/groups?id=eq.${encodeURIComponent(groupId)}`, { method: 'DELETE' });
}

export async function fetchMembers(groupId: string): Promise<GroupMember[]> {
  return rest<GroupMember[]>(
    `/group_members?group_id=eq.${encodeURIComponent(groupId)}&select=*&order=joined_at.asc`,
  );
}

export async function fetchBlocks(): Promise<Block[]> {
  return rest<Block[]>('/blocks?select=*&order=created_at.asc');
}

export async function blockUser(username: string): Promise<void> {
  await rest<void>('/blocks', {
    method: 'POST',
    body: { blocked_username: username },
    // Ignore a duplicate block instead of erroring.
    prefer: 'resolution=merge-duplicates',
  });
}

export async function unblockUser(username: string): Promise<void> {
  await rest<void>(`/blocks?blocked_username=eq.${encodeURIComponent(username)}`, { method: 'DELETE' });
}

export async function upsertProfile(id: string, username: string, phone?: string | null): Promise<void> {
  await rest<void>('/profiles', {
    method: 'POST',
    body: { id, username, phone: phone ?? null },
    prefer: 'resolution=merge-duplicates',
  });
}
