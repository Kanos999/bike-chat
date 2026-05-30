export interface PresenceUpdate {
  riderId: string;
  lat: number;
  lon: number;
  rideMode: 'OFF' | 'OPEN' | 'FRIENDS_ONLY';
  timestamp: number;
  /** Optional rider velocity. Lets the matcher gate by heading at road speeds. */
  headingDeg?: number | null;
  speedKph?: number | null;
  /** Active crew id when riding FRIENDS_ONLY (scopes the channel to the crew). */
  groupId?: string | null;
  /** Rider ids this rider has blocked; a block prevents linking either way. */
  blockedRiderIds?: string[];
}

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

export interface ApiClient {
  updatePresence(update: PresenceUpdate): Promise<void>;
  getAssignedChannel(riderId: string): Promise<NearbyChannelResponse>;
}
