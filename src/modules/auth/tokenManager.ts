/**
 * Keeps the Supabase access token fresh for the lifetime of a running session.
 *
 * The access token is a short-lived JWT (Supabase default: 1 hour). Every REST
 * call, the presence-subscribe/control WebSocket and the voice/LiveKit token read
 * it from the `__BikeChatSupabaseAccessToken` global (see config.authToken). If the
 * token isn't refreshed while the app keeps running, a ride (or an idle ride-mode
 * session) longer than the TTL starts getting 401s — presence writes fail and the
 * WS reconnect loops with a dead token.
 *
 * This manager owns two refresh strategies:
 *   1. Proactive — schedule a refresh a couple of minutes before `expires_at`, so a
 *      long ride never crosses the expiry boundary with a stale token.
 *   2. Reactive — `refreshNow()` forces an immediate, de-duplicated refresh, used by
 *      the API client's retry-once-on-401 path (covers clock drift, Doze-delayed
 *      timers, and device sleep that stalls the proactive timer).
 *
 * On every refresh it re-applies the token to the globals and notifies the auth
 * slice so the store's `session` stays in sync.
 */
import { loadStoredSession, refreshSession, SupabaseSession } from './supabaseAuth';

/** Refresh this many seconds before the token's `expires_at`. */
const REFRESH_SKEW_SECONDS = 120;
/** If we're already past (or within skew of) expiry, retry soon rather than hammer. */
const MIN_REFRESH_DELAY_MS = 5_000;
/** Never schedule further out than this, so a bogus far-future expiry still refreshes. */
const MAX_REFRESH_DELAY_MS = 30 * 60 * 1000;

type SessionListener = (session: SupabaseSession | null) => void;

let listener: SessionListener | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<SupabaseSession | null> | null = null;

/** Write the access token to the global that config.authToken reads. */
function applyToken(session: SupabaseSession | null): void {
  (global as unknown as { __BikeChatSupabaseAccessToken?: string }).__BikeChatSupabaseAccessToken =
    session?.access_token;
}

function clearTimer(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function scheduleRefresh(session: SupabaseSession | null): void {
  clearTimer();
  if (!session?.expires_at || !session.refresh_token) return;
  const nowMs = Date.now();
  const expiresMs = session.expires_at * 1000;
  const delay = Math.min(
    Math.max(expiresMs - REFRESH_SKEW_SECONDS * 1000 - nowMs, MIN_REFRESH_DELAY_MS),
    MAX_REFRESH_DELAY_MS
  );
  refreshTimer = setTimeout(() => {
    void refreshNow();
  }, delay);
}

/**
 * Force an immediate token refresh, de-duplicating concurrent callers (a burst of
 * 401s from parallel requests triggers a single refresh). Applies the new token to
 * the globals, notifies the listener, and reschedules the proactive refresh.
 * Returns the fresh access token, or null if refresh wasn't possible.
 */
export async function refreshNow(): Promise<string | null> {
  if (!inFlight) {
    inFlight = (async () => {
      const stored = await loadStoredSession();
      if (!stored?.refresh_token) return null;
      const next = await refreshSession(stored.refresh_token);
      applyToken(next);
      listener?.(next);
      scheduleRefresh(next);
      return next;
    })().catch(() => null);
  }
  try {
    const session = await inFlight;
    return session?.access_token ?? null;
  } finally {
    inFlight = null;
  }
}

/**
 * Begin managing a session: apply its token now and schedule the proactive refresh.
 * `onSessionUpdate` is called whenever the token is refreshed so the store can track
 * the new session. Safe to call again on a new sign-in — it replaces the schedule.
 */
export function startTokenManager(
  session: SupabaseSession | null,
  onSessionUpdate: SessionListener
): void {
  listener = onSessionUpdate;
  applyToken(session);
  scheduleRefresh(session);
}

/** Stop managing (logout): clear the timer, listener and token. */
export function stopTokenManager(): void {
  clearTimer();
  listener = null;
  inFlight = null;
  applyToken(null);
}
