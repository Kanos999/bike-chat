import { IntercomState, VoiceModule } from './types';

type Listener = (state: IntercomState) => void;

export const createMockVoiceModule = (): VoiceModule => {
  let state: IntercomState = 'DISABLED';
  let currentChannel: string | null = null;
  const listeners: Listener[] = [];
  const peerListeners: Array<(peerIds: string[]) => void> = [];

  const notify = () => listeners.forEach((listener) => listener(state));
  const notifyPeers = (peerIds: string[]) => peerListeners.forEach((listener) => listener(peerIds));

  const init = async () => {
    state = 'IDLE';
    notify();
    notifyPeers([]);
  };

  const joinChannel = async (channelId: string) => {
    currentChannel = channelId;
    if (state !== 'MUTED_LOCAL' && state !== 'MUTED_GLOBAL') {
      state = 'OPEN';
    }
    notify();
    notifyPeers(['demo-rider-7']);
  };

  const leaveChannel = async () => {
    currentChannel = null;
    state = 'IDLE';
    notify();
    notifyPeers([]);
  };

  const setLocalMute = async (muted: boolean) => {
    if (muted) {
      state = 'MUTED_LOCAL';
    } else if (currentChannel) {
      state = 'OPEN';
    } else {
      state = 'IDLE';
    }
    notify();
  };

  const setGlobalMute = async (muted: boolean) => {
    if (muted) {
      state = 'MUTED_GLOBAL';
    } else if (currentChannel) {
      state = 'OPEN';
    } else {
      state = 'IDLE';
    }
    notify();
  };

  const getState = () => state;

  const onStateChange = (listener: Listener) => {
    listeners.push(listener);
    listener(state);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  };

  const onPeersChange = (listener: (peerIds: string[]) => void) => {
    peerListeners.push(listener);
    listener(currentChannel ? ['demo-rider-7'] : []);
    return () => {
      const index = peerListeners.indexOf(listener);
      if (index >= 0) peerListeners.splice(index, 1);
    };
  };

  const subscribeToInputLevel = (_callback: (level: number) => void) => {
    return () => {};
  };

  return {
    init,
    joinChannel,
    leaveChannel,
    setLocalMute,
    setGlobalMute,
    getState,
    onStateChange,
    onPeersChange,
    subscribeToInputLevel,
  };
};
