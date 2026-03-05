import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { StateCreator } from 'zustand';
import { createAnalyticsSlice, AnalyticsSlice } from './analyticsSlice';
import { createProximitySlice, ProximitySlice } from './proximitySlice';
import { createRideSlice, RideSlice } from './rideSlice';
import { createVoiceSlice, VoiceSlice } from './voiceSlice';
import { createAuthSlice, AuthSlice } from './authSlice';

export type AppState = RideSlice & ProximitySlice & VoiceSlice & AnalyticsSlice & AuthSlice;

const withDevtools = <T>(creator: StateCreator<T>) => devtools(creator, { name: 'BikeChatStore' });

export const useAppStore = create<AppState>()(
  withDevtools((set, get, api) => ({
    ...createRideSlice(set, get, api),
    ...createProximitySlice(set, get, api),
    ...createVoiceSlice(set, get, api),
    ...createAnalyticsSlice(set, get, api),
    ...createAuthSlice(set, get, api),
  })),
);
