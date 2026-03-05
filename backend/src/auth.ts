import type { Request } from 'express';

interface AuthContext {
  authorizeHttp: (req: Request) => Promise<boolean>;
  authorizeWsToken: (token: string | null) => Promise<boolean>;
  mode: 'none' | 'shared-token' | 'supabase';
}

interface CachedAuth {
  valid: boolean;
  expiresAt: number;
}

const AUTH_CACHE_TTL_MS = 30_000;

export function createAuthContextFromEnv(): AuthContext {
  const sharedToken = process.env.AUTH_TOKEN?.trim() || null;
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || null;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() || null;
  const cache = new Map<string, CachedAuth>();

  const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey);

  const verifyWithSupabase = async (token: string): Promise<boolean> => {
    const cached = cache.get(token);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.valid;

    if (!supabaseUrl || !supabaseAnonKey) return false;
    try {
      const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
      });
      const valid = res.ok;
      cache.set(token, { valid, expiresAt: now + AUTH_CACHE_TTL_MS });
      return valid;
    } catch {
      return false;
    }
  };

  const authorizeToken = async (token: string | null): Promise<boolean> => {
    if (!sharedToken && !hasSupabase) return true;
    if (!token) return false;
    if (sharedToken && token === sharedToken) return true;
    if (hasSupabase) return verifyWithSupabase(token);
    return false;
  };

  const tokenFromRequest = (req: Request): string | null => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice(7).trim() || null;
  };

  return {
    authorizeHttp: async (req) => authorizeToken(tokenFromRequest(req)),
    authorizeWsToken: authorizeToken,
    mode: hasSupabase ? 'supabase' : sharedToken ? 'shared-token' : 'none',
  };
}
