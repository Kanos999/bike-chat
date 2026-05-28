import { ApiClient, NearbyChannelResponse, PresenceUpdate } from './types';

export const createMockApiClient = (): ApiClient => {
  let lastPresence: PresenceUpdate | null = null;
  const candidateChannels = ['local-1', 'local-2', null];
  let channelIndex = 0;

  const updatePresence = async (update: PresenceUpdate) => {
    lastPresence = update;
    console.log('[mock api] presence update', lastPresence);
  };

  const getAssignedChannel = async (_riderId: string): Promise<NearbyChannelResponse> => {
    channelIndex = (channelIndex + 1) % candidateChannels.length;
    const channelId = candidateChannels[channelIndex];
    return {
      channelId,
      members: channelId
        ? [
            {
              riderId: 'demo-rider-7',
              rideMode: 'OPEN',
              lat: 37.77495,
              lon: -122.41945,
              distanceMeters: 42,
            },
            {
              riderId: 'demo-rider-8',
              rideMode: 'OPEN',
              lat: 37.77505,
              lon: -122.4195,
              distanceMeters: 67,
            },
          ]
        : [],
    };
  };

  return {
    updatePresence,
    getAssignedChannel,
  };
};
