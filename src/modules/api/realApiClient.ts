import { config } from '../../config';
import { refreshNow } from '../auth/tokenManager';
import type { ApiClient, ChannelMemberSummary, NearbyChannelResponse, PresenceUpdate } from './types';

export function createRealApiClient(): ApiClient {
  const authHeaders = (): Record<string, string> =>
    config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {};

  const apiLogs = Boolean((globalThis as any)?.__BikeChatApiLogs);

  const log = (...args: any[]) => {
    if (!apiLogs) return;
    // eslint-disable-next-line no-console
    console.log('[api]', ...args);
  };

  /**
   * fetch that recovers from an expired access token: on a 401 it forces a token
   * refresh and retries the request once with the fresh token. `build` is called
   * per attempt so the retry picks up the just-refreshed Authorization header.
   */
  const fetchWithAuthRetry = async (build: () => { url: string; init: RequestInit }): Promise<Response> => {
    const first = build();
    const res = await fetch(first.url, first.init);
    if (res.status !== 401) return res;
    log(first.url, '-> 401, refreshing token and retrying');
    const token = await refreshNow();
    if (!token) return res; // couldn't refresh (no session) — surface the original 401
    const retry = build();
    return fetch(retry.url, retry.init);
  };

  const updatePresence = async (update: PresenceUpdate): Promise<void> => {
    const url = `${config.apiBaseUrl}/presence`;
    log('POST', url, { riderId: update.riderId });
    let res: Response;
    try {
      res = await fetchWithAuthRetry(() => ({
        url,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(update),
        },
      }));
    } catch (e) {
      throw new Error(`Presence update network error: ${e instanceof Error ? e.message : String(e)} (url: ${url})`);
    }
    log('POST', url, '->', res.status);
    if (!res.ok) throw new Error(`Presence update failed: ${res.status}`);
  };

  const getAssignedChannel = async (riderId: string): Promise<NearbyChannelResponse> => {
    const url = `${config.apiBaseUrl}/presence/channel?riderId=${encodeURIComponent(riderId)}`;
    log('GET', url);
    let res: Response;
    try {
      res = await fetchWithAuthRetry(() => ({ url, init: { headers: authHeaders() } }));
    } catch (e) {
      throw new Error(`Get channel network error: ${e instanceof Error ? e.message : String(e)} (url: ${url})`);
    }
    log('GET', url, '->', res.status);
    if (!res.ok) throw new Error(`Get channel failed: ${res.status}`);
    const data = (await res.json()) as { channelId: string | null; members?: ChannelMemberSummary[] };
    return { channelId: data.channelId, members: Array.isArray(data.members) ? data.members : [] };
  };

  return {
    updatePresence,
    getAssignedChannel,
  };
}
