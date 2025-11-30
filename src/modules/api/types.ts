export interface PresenceUpdate {
  riderId: string;
  lat: number;
  lon: number;
  rideMode: 'OFF' | 'OPEN' | 'FRIENDS_ONLY';
  timestamp: number;
}

export interface NearbyChannelResponse {
  channelId: string | null;
}

export interface ApiClient {
  updatePresence(update: PresenceUpdate): Promise<void>;
  getAssignedChannel(): Promise<NearbyChannelResponse>;
}
