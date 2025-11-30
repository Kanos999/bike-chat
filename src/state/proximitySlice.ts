import { StateCreator } from 'zustand';
import { RiderBeacon } from '../modules/bluetooth/types';
import { upsertBeacon } from '../modules/proximity/utils';

export interface ProximitySlice {
  nearbyRiders: RiderBeacon[];
  currentChannelId: string | null;
  lastPingAt: number | null;
  upsertRider: (beacon: RiderBeacon) => void;
  setChannel: (channelId: string | null, shouldPing: boolean) => void;
  clearProximity: () => void;
}

export const createProximitySlice: StateCreator<
  ProximitySlice,
  [['zustand/devtools', never]],
  [],
  ProximitySlice
> = (set) => ({
  nearbyRiders: [],
  currentChannelId: null,
  lastPingAt: null,
  upsertRider: (beacon) =>
    set((state) => ({
      nearbyRiders: upsertBeacon(state.nearbyRiders, beacon),
    })),
  setChannel: (channelId, shouldPing) =>
    set(() => ({
      currentChannelId: channelId,
      lastPingAt: shouldPing && channelId ? Date.now() : null,
    })),
  clearProximity: () => set({ nearbyRiders: [], currentChannelId: null }),
});
