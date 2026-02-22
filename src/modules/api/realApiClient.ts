import { config } from '../../config';
import type { ApiClient, NearbyChannelResponse, PresenceUpdate } from './types';

export function createRealApiClient(): ApiClient {
  const base = config.apiBaseUrl;

  const updatePresence = async (update: PresenceUpdate): Promise<void> => {
    const res = await fetch(`${base}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    if (!res.ok) throw new Error(`Presence update failed: ${res.status}`);
  };

  const getAssignedChannel = async (riderId: string): Promise<NearbyChannelResponse> => {
    const res = await fetch(`${base}/presence/channel?riderId=${encodeURIComponent(riderId)}`);
    if (!res.ok) throw new Error(`Get channel failed: ${res.status}`);
    const data = (await res.json()) as { channelId: string | null };
    return { channelId: data.channelId };
  };

  return {
    updatePresence,
    getAssignedChannel,
  };
}
