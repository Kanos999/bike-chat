import { StateCreator } from 'zustand';
import type { RideSummary } from '../modules/analytics';

export interface AnalyticsSlice {
  lastSummary: RideSummary | null;
  isRecording: boolean;
  setLastSummary: (summary: RideSummary | null) => void;
  clearLastSummary: () => void;
  setRecording: (recording: boolean) => void;
}

export const createAnalyticsSlice: StateCreator<
  AnalyticsSlice,
  [['zustand/devtools', never]],
  [],
  AnalyticsSlice
> = (set) => ({
  lastSummary: null,
  isRecording: false,
  setLastSummary: (summary) => set({ lastSummary: summary }),
  clearLastSummary: () => set({ lastSummary: null }),
  setRecording: (recording) => set({ isRecording: recording }),
});
