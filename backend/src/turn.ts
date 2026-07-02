import { createHmac } from 'crypto';

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface TurnCredentials {
  iceServers: IceServer[];
  /** Seconds the returned TURN credentials remain valid. */
  ttl: number;
}

export interface TurnConfig {
  /** True when a TURN secret + URLs are configured (i.e. real relay available). */
  enabled: boolean;
  /** Build an ICE server list (STUN always, TURN when enabled) for a rider. */
  generate: (identifier: string) => TurnCredentials;
}

function splitList(value: string | undefined, fallback: string[] = []): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * TURN credential provider using the coturn "use-auth-secret" REST scheme
 * (draft-uberti-behave-turn-rest): a shared secret produces short-lived,
 * time-limited credentials so we never ship a static relay password to clients.
 *
 * Env:
 * - TURN_SECRET       shared secret; must match coturn `static-auth-secret`.
 * - TURN_URLS         comma-separated turn/turns URLs, e.g.
 *                     "turn:turn.host:3478?transport=udp,turns:turn.host:5349?transport=tcp"
 * - STUN_URLS         comma-separated STUN URLs (defaults to Google STUN).
 * - TURN_TTL_SECONDS  credential lifetime (default 86400).
 */
export function createTurnConfigFromEnv(): TurnConfig {
  const secret = process.env.TURN_SECRET?.trim() || null;
  const turnUrls = splitList(process.env.TURN_URLS);
  const stunUrls = splitList(process.env.STUN_URLS, ['stun:stun.l.google.com:19302']);
  const ttlSeconds = Math.max(60, parseInt(process.env.TURN_TTL_SECONDS || '86400', 10) || 86400);

  const enabled = Boolean(secret && turnUrls.length > 0);

  const generate = (identifier: string): TurnCredentials => {
    const iceServers: IceServer[] = [];
    if (stunUrls.length) iceServers.push({ urls: stunUrls });

    if (enabled && secret) {
      const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
      // coturn expects username "<expiry-unix-ts>[:<id>]" and
      // credential = base64(HMAC-SHA1(secret, username)).
      const safeId = (identifier || 'bikechat').replace(/[^a-zA-Z0-9_.-]/g, '');
      const username = `${expiry}:${safeId}`;
      const credential = createHmac('sha1', secret).update(username).digest('base64');
      iceServers.push({ urls: turnUrls, username, credential });
    }

    return { iceServers, ttl: ttlSeconds };
  };

  return { enabled, generate };
}
