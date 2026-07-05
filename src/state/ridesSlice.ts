import { StateCreator } from 'zustand';
import {
  deleteRide as deleteRideRequest,
  getRideMatches,
  listRides,
  saveRide as saveRideRequest,
  saveRideMatches,
  RideRow,
} from '../modules/groups/supabaseData';
import type { RideSummary } from '../modules/analytics';
import type { AuthSlice } from './authSlice';

export interface RidesSlice {
  rides: RideRow[];
  matchesByRide: Record<string, string[]>;
  ridesLoading: boolean;
  ridesError: string | null;
  loadRides: () => Promise<void>;
  loadRideMatches: (rideId: string) => Promise<void>;
  deleteRide: (rideId: string) => Promise<{ error?: string }>;
  saveRide: (
    summary: RideSummary,
    rideMode: string,
    groupId: string | null,
    matchedUsernames: string[],
  ) => Promise<void>;
}

type Store = RidesSlice & AuthSlice;

export const createRidesSlice: StateCreator<
  Store,
  [['zustand/devtools', never]],
  [],
  RidesSlice
> = (set, get) => ({
  rides: [],
  matchesByRide: {},
  ridesLoading: false,
  ridesError: null,

  loadRides: async () => {
    set({ ridesLoading: true, ridesError: null });
    try {
      const rides = await listRides();
      set({ rides, ridesLoading: false });
    } catch (e) {
      set({ ridesLoading: false, ridesError: e instanceof Error ? e.message : 'Failed to load rides' });
    }
  },

  loadRideMatches: async (rideId) => {
    try {
      const usernames = await getRideMatches(rideId);
      set((s) => ({ matchesByRide: { ...s.matchesByRide, [rideId]: usernames } }));
    } catch (e) {
      set({ ridesError: e instanceof Error ? e.message : 'Failed to load matched riders' });
    }
  },

  deleteRide: async (rideId) => {
    try {
      await deleteRideRequest(rideId);
      set((s) => {
        const matchesByRide = { ...s.matchesByRide };
        delete matchesByRide[rideId];
        return { rides: s.rides.filter((r) => r.id !== rideId), matchesByRide };
      });
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to delete ride' };
    }
  },

  saveRide: async (summary, rideMode, groupId, matchedUsernames) => {
    // Best-effort: a failed sync must never break the end-of-ride flow.
    if (!get().session) return;
    try {
      const row = await saveRideRequest({
        started_at: new Date(summary.startedAt).toISOString(),
        ended_at: new Date(summary.endedAt).toISOString(),
        ride_mode: rideMode,
        group_id: groupId,
        distance_km: summary.stats.distanceKm,
        max_speed_kph: summary.stats.maxSpeedKph,
        avg_speed_kph: summary.stats.avgSpeedKph,
        max_lean_left_deg: summary.stats.maxLeanLeftDeg,
        max_lean_right_deg: summary.stats.maxLeanRightDeg,
        time_moving_sec: summary.stats.timeMovingSec,
        time_stopped_sec: summary.stats.timeStoppedSec,
        summary,
      });
      const matched = Array.from(new Set(matchedUsernames)).filter((u) => u.trim().length > 0);
      if (matched.length > 0) await saveRideMatches(row.id, matched);
      set((s) => ({
        rides: [row, ...s.rides],
        matchesByRide: { ...s.matchesByRide, [row.id]: matched },
      }));
    } catch (e) {
      set({ ridesError: e instanceof Error ? e.message : 'Failed to save ride' });
    }
  },
});
