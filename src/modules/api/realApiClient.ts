import { config } from '../../config';
import type { ApiClient, NearbyChannelResponse, PresenceUpdate } from './types';

export function createRealApiClient(): ApiClient {
  const authHeaders = (): Record<string, string> =>
    config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {};

  const updatePresence = async (update: PresenceUpdate): Promise<void> => {
    const res = await fetch(`${config.apiBaseUrl}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(update),
    });
    if (!res.ok) throw new Error(`Presence update failed: ${res.status}`);
  };

  const getAssignedChannel = async (riderId: string): Promise<NearbyChannelResponse> => {
    const res = await fetch(`${config.apiBaseUrl}/presence/channel?riderId=${encodeURIComponent(riderId)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`Get channel failed: ${res.status}`);
    const data = (await res.json()) as { channelId: string | null };
    return { channelId: data.channelId };
  };

  return {
    updatePresence,
    getAssignedChannel,
  };
}
