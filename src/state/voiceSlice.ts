import { StateCreator } from 'zustand';
import { services } from '../modules/services';
import { IntercomState } from '../modules/voice/types';
import { GroupsSlice } from './groupsSlice';
import { ProximitySlice } from './proximitySlice';
import { RideSessionHandles } from './types';

function samePeerIds(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export interface VoiceSlice {
  intercomState: IntercomState;
  localMuted: boolean;
  globalMuted: boolean;
  connectedPeerIds: string[];
  attachVoiceListener: (handles: RideSessionHandles) => void;
  attachVoicePeerListener: (handles: RideSessionHandles) => void;
  toggleLocalMute: () => Promise<void>;
  toggleGlobalMute: () => Promise<void>;
  setIntercomState: (state: IntercomState) => void;
}

type Store = VoiceSlice & GroupsSlice & ProximitySlice;

export const createVoiceSlice: StateCreator<
  Store,
  [['zustand/devtools', never]],
  [],
  VoiceSlice
> = (set, get) => ({
  intercomState: 'DISABLED',
  localMuted: false,
  globalMuted: false,
  connectedPeerIds: [],
  attachVoiceListener: (handles) => {
    if (handles.unsubscribeVoice) return;
    handles.unsubscribeVoice = services.voice.onStateChange((state) => {
      set((current) => {
        const localMuted = state === 'MUTED_LOCAL';
        const globalMuted = state === 'MUTED_GLOBAL';
        if (
          current.intercomState === state &&
          current.localMuted === localMuted &&
          current.globalMuted === globalMuted
        ) {
          return current;
        }
        return {
          intercomState: state,
          localMuted,
          globalMuted,
        };
      });
    });
  },
  attachVoicePeerListener: (handles) => {
    if (handles.unsubscribeVoicePeers || !services.voice.onPeersChange) return;
    handles.unsubscribeVoicePeers = services.voice.onPeersChange((peerIds) => {
      const prev = get().connectedPeerIds;
      if (samePeerIds(prev, peerIds)) return;
      // A peer appearing / disappearing in the WebRTC mesh is the real "rider
      // joined / left" moment.
      const someoneJoined = peerIds.some((id) => !prev.includes(id));
      const someoneLeft = prev.some((id) => !peerIds.includes(id));
      set({ connectedPeerIds: peerIds });
      if (someoneJoined) get().notifyJoin();
      // Only chime a leave while we're actually in a channel — this skips the mass
      // peer-drop that happens when *we* end the ride / tear the channel down.
      if (someoneLeft && get().currentChannelId) get().notifyLeave();
    });
  },
  setIntercomState: (state) =>
    set((current) => {
      const localMuted = state === 'MUTED_LOCAL';
      const globalMuted = state === 'MUTED_GLOBAL';
      if (
        current.intercomState === state &&
        current.localMuted === localMuted &&
        current.globalMuted === globalMuted
      ) {
        return current;
      }
      return {
        intercomState: state,
        localMuted,
        globalMuted,
      };
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
