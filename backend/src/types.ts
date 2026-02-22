export interface PresenceUpdate {
  riderId: string;
  lat: number;
  lon: number;
  rideMode: 'OFF' | 'OPEN' | 'FRIENDS_ONLY';
  timestamp: number;
}

export interface StoredPresence extends PresenceUpdate {}

export interface NearbyChannelResponse {
  channelId: string | null;
}
