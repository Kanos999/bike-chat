export interface PresenceUpdate {
  riderId: string;
  lat: number;
  lon: number;
  rideMode: 'OFF' | 'OPEN' | 'FRIENDS_ONLY';
  timestamp: number;
  /** Optional rider velocity. Used to gate matching by heading at road speeds. */
  headingDeg?: number | null;
  speedKph?: number | null;
}

export interface StoredPresence extends PresenceUpdate {}

export interface ChannelMemberSummary {
  riderId: string;
  rideMode: 'OPEN' | 'FRIENDS_ONLY';
  lat: number;
  lon: number;
  distanceMeters: number;
}

export interface NearbyChannelResponse {
  channelId: string | null;
  members: ChannelMemberSummary[];
}
