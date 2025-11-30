import { StateCreator } from 'zustand';
import { services } from '../modules/services';
import { IntercomState } from '../modules/voice/types';
import { RideSessionHandles } from './types';

export interface VoiceSlice {
  intercomState: IntercomState;
  localMuted: boolean;
  globalMuted: boolean;
  attachVoiceListener: (handles: RideSessionHandles) => void;
  toggleLocalMute: () => Promise<void>;
  toggleGlobalMute: () => Promise<void>;
  setIntercomState: (state: IntercomState) => void;
}

export const createVoiceSlice: StateCreator<
  VoiceSlice,
  [['zustand/devtools', never]],
  [],
  VoiceSlice
> = (set, get) => ({
  intercomState: 'DISABLED',
  localMuted: false,
  globalMuted: false,
  attachVoiceListener: (handles) => {
    if (handles.unsubscribeVoice) return;
    handles.unsubscribeVoice = services.voice.onStateChange((state) => {
      set({
        intercomState: state,
        localMuted: state === 'MUTED_LOCAL',
        globalMuted: state === 'MUTED_GLOBAL',
      });
    });
  },
  setIntercomState: (state) =>
    set({
      intercomState: state,
      localMuted: state === 'MUTED_LOCAL',
      globalMuted: state === 'MUTED_GLOBAL',
    }),
  toggleLocalMute: async () => {
    const next = !get().localMuted;
    await services.voice.setLocalMute(next);
    set({
      localMuted: next,
      intercomState: next ? 'MUTED_LOCAL' : services.voice.getState(),
    });
  },
  toggleGlobalMute: async () => {
    const next = !get().globalMuted;
    await services.voice.setGlobalMute(next);
    set({
      globalMuted: next,
      intercomState: next ? 'MUTED_GLOBAL' : services.voice.getState(),
    });
  },
});
