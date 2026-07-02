import { AccessToken } from 'livekit-server-sdk';

export interface VoiceTokenResult {
  /** LiveKit server URL the client should connect to (wss://...). */
  url: string;
  /** Signed access token scoped to the room + identity. */
  token: string;
  /** Room name (== the proximity channel id). */
  room: string;
  /** Participant identity (== riderId). */
  identity: string;
  /** Seconds the token is valid for joining. */
  ttl: number;
}

export interface LiveKitConfig {
  /** True when LiveKit URL + API key/secret are all configured. */
  enabled: boolean;
  /** Public LiveKit server URL (null when not configured). */
  url: string | null;
  /** Mint a join token for a rider on a given proximity channel. */
  generate: (channelId: string, identity: string) => Promise<VoiceTokenResult>;
}

/**
 * LiveKit voice-token provider. A proximity channel maps 1:1 to a LiveKit room, so
 * a token grants a signed-in rider join/publish/subscribe on exactly the room for
 * their currently-assigned channel. Media never touches this backend — LiveKit
 * Cloud (the SFU) forwards audio; we only mint the JWT.
 *
 * Env:
 * - LIVEKIT_URL                wss://<project>.livekit.cloud
 * - LIVEKIT_API_KEY            project API key
 * - LIVEKIT_API_SECRET         project API secret
 * - LIVEKIT_TOKEN_TTL_SECONDS  join-token lifetime (default 3600)
 */
export function createLiveKitConfigFromEnv(): LiveKitConfig {
  const url = process.env.LIVEKIT_URL?.trim() || null;
  const apiKey = process.env.LIVEKIT_API_KEY?.trim() || null;
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim() || null;
  const ttlSeconds = Math.max(
    60,
    parseInt(process.env.LIVEKIT_TOKEN_TTL_SECONDS || '3600', 10) || 3600
  );

  const enabled = Boolean(url && apiKey && apiSecret);

  const generate = async (channelId: string, identity: string): Promise<VoiceTokenResult> => {
    if (!enabled || !url || !apiKey || !apiSecret) {
      throw new Error('LiveKit is not configured');
    }
    const room = channelId;
    const at = new AccessToken(apiKey, apiSecret, { identity, ttl: ttlSeconds });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();
    return { url, token, room, identity, ttl: ttlSeconds };
  };

  return { enabled, url, generate };
}
