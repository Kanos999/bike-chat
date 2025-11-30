import { devtools, StateCreator } from 'zustand/middleware';
import { create } from 'zustand';
import { createProximitySlice, ProximitySlice } from './proximitySlice';
import { createRideSlice, RideSlice } from './rideSlice';
import { createVoiceSlice, VoiceSlice } from './voiceSlice';

export type AppState = RideSlice & ProximitySlice & VoiceSlice;

const withDevtools = <T>(creator: StateCreator<T>) => devtools(creator, { name: 'BikeChatStore' });

export const useAppStore = create<AppState>()(
  withDevtools((...args) => ({
    ...createRideSlice(...args),
    ...createProximitySlice(...args),
    ...createVoiceSlice(...args),
  })),
);
