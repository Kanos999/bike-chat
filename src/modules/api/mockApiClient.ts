import { ApiClient, NearbyChannelResponse, PresenceUpdate } from './types';

export const createMockApiClient = (): ApiClient => {
  let lastPresence: PresenceUpdate | null = null;
  const candidateChannels = ['local-1', 'local-2', null];
  let channelIndex = 0;

  const updatePresence = async (update: PresenceUpdate) => {
    lastPresence = update;
    console.log('[mock api] presence update', lastPresence);
  };

  const getAssignedChannel = async (): Promise<NearbyChannelResponse> => {
    channelIndex = (channelIndex + 1) % candidateChannels.length;
    const channelId = candidateChannels[channelIndex];
    return { channelId };
  };

  return {
    updatePresence,
    getAssignedChannel,
  };
};
