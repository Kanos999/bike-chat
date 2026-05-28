import { StateCreator } from 'zustand';
import { ChannelMemberSummary } from '../modules/api/types';
import { RiderBeacon } from '../modules/bluetooth/types';
import { upsertBeacon } from '../modules/proximity/utils';

function sameMatchedRiders(a: ChannelMemberSummary[], b: ChannelMemberSummary[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.riderId !== right.riderId ||
      left.rideMode !== right.rideMode ||
      left.lat !== right.lat ||
      left.lon !== right.lon ||
      left.distanceMeters !== right.distanceMeters
    ) {
      return false;
    }
  }
  return true;
}

export interface ProximitySlice {
  nearbyRiders: RiderBeacon[];
  matchedRiders: ChannelMemberSummary[];
  currentChannelId: string | null;
  lastPingAt: number | null;
  upsertRider: (beacon: RiderBeacon) => void;
  setChannel: (channelId: string | null, shouldPing: boolean) => void;
  setMatchedRiders: (riders: ChannelMemberSummary[]) => void;
  clearProximity: () => void;
}

export const createProximitySlice: StateCreator<
  ProximitySlice,
  [['zustand/devtools', never]],
  [],
  ProximitySlice
> = (set) => ({
  nearbyRiders: [],
  matchedRiders: [],
  currentChannelId: null,
  lastPingAt: null,
  upsertRider: (beacon) =>
    set((state) => {
      const nearbyRiders = upsertBeacon(state.nearbyRiders, beacon);
      return nearbyRiders === state.nearbyRiders ? state : { nearbyRiders };
    }),
  setChannel: (channelId, shouldPing) =>
    set((state) => {
      const lastPingAt = shouldPing && channelId ? Date.now() : null;
      if (state.currentChannelId === channelId && state.lastPingAt === lastPingAt) {
        return state;
      }
      return {
        currentChannelId: channelId,
        lastPingAt,
      };
    }),
  setMatchedRiders: (riders) =>
    set((state) => (sameMatchedRiders(state.matchedRiders, riders) ? state : { matchedRiders: riders })),
  clearProximity: () =>
    set((state) =>
      state.nearbyRiders.length === 0 && state.matchedRiders.length === 0 && state.currentChannelId === null
        ? state
        : { nearbyRiders: [], matchedRiders: [], currentChannelId: null }
    ),
});
