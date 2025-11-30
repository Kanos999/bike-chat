import { IntercomState, VoiceModule } from './types';

type Listener = (state: IntercomState) => void;

export const createMockVoiceModule = (): VoiceModule => {
  let state: IntercomState = 'DISABLED';
  let currentChannel: string | null = null;
  const listeners: Listener[] = [];

  const notify = () => listeners.forEach((listener) => listener(state));

  const init = async () => {
    state = 'IDLE';
    notify();
  };

  const joinChannel = async (channelId: string) => {
    currentChannel = channelId;
    if (state !== 'MUTED_LOCAL' && state !== 'MUTED_GLOBAL') {
      state = 'OPEN';
    }
    notify();
  };

  const leaveChannel = async () => {
    currentChannel = null;
    state = 'IDLE';
    notify();
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

  return {
    init,
    joinChannel,
    leaveChannel,
    setLocalMute,
    setGlobalMute,
    getState,
    onStateChange,
  };
};
