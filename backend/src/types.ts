export interface PresenceUpdate {
  riderId: string;
  lat: number;
  lon: number;
  rideMode: 'OFF' | 'OPEN' | 'FRIENDS_ONLY';
  timestamp: number;
  /** Optional rider velocity. Used to gate matching by heading at road speeds. */
  headingDeg?: number | null;
  speedKph?: number | null;
  /**
   * Active crew id when riding FRIENDS_ONLY. Two FRIENDS_ONLY riders only link
   * when they share the same non-null groupId, so a private crew is scoped to
   * its members. Ignored in OPEN mode.
   */
  groupId?: string | null;
  /**
   * Rider ids this rider has blocked. The matcher never links two riders if
   * either one blocks the other, in any mode.
   */
  blockedRiderIds?: string[];
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
