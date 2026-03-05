import { config } from '../../config';
import type { ApiClient, NearbyChannelResponse, PresenceUpdate } from './types';

export function createRealApiClient(): ApiClient {
  const authHeaders = (): Record<string, string> =>
    config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {};

  const apiLogs = Boolean((global as any)?.__BikeChatApiLogs);

  const log = (...args: any[]) => {
    if (!apiLogs) return;
    // eslint-disable-next-line no-console
    console.log('[api]', ...args);
  };

  const updatePresence = async (update: PresenceUpdate): Promise<void> => {
    const url = `${config.apiBaseUrl}/presence`;
    log('POST', url, { riderId: update.riderId });
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(update),
      });
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
      res = await fetch(url, { headers: authHeaders() });
    } catch (e) {
      throw new Error(`Get channel network error: ${e instanceof Error ? e.message : String(e)} (url: ${url})`);
    }
    log('GET', url, '->', res.status);
    if (!res.ok) throw new Error(`Get channel failed: ${res.status}`);
    const data = (await res.json()) as { channelId: string | null };
    return { channelId: data.channelId };
  };

  return {
    updatePresence,
    getAssignedChannel,
  };
}
