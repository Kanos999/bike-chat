import type { IntercomState, VoiceModule } from './types';
import { config } from '../../config';

type Listener = (state: IntercomState) => void;

export function createRealVoiceModule(): VoiceModule {
  let state: IntercomState = 'DISABLED';
  let ws: WebSocket | null = null;
  let currentChannel: string | null = null;
  let localMuted = false;
  let globalMuted = false;
  const listeners: Listener[] = [];

  const notify = () => listeners.forEach((l) => l(state));

  const setState = (s: IntercomState) => {
    state = s;
    notify();
  };

  const closeWs = () => {
    if (ws) {
      ws.close();
      ws = null;
    }
    currentChannel = null;
  };

  const init = async (): Promise<void> => {
    setState('IDLE');
  };

  const joinChannel = async (channelId: string): Promise<void> => {
    closeWs();
    const riderId = config.getRiderId();
    const tokenParam = config.authToken ? `&token=${encodeURIComponent(config.authToken)}` : '';
    const url = `${config.wsBaseUrl}?channelId=${encodeURIComponent(channelId)}&riderId=${encodeURIComponent(riderId)}${tokenParam}`;
    return new Promise((resolve, reject) => {
      try {
        ws = new WebSocket(url);
        ws.onopen = () => {
          currentChannel = channelId;
          setState(globalMuted ? 'MUTED_GLOBAL' : localMuted ? 'MUTED_LOCAL' : 'OPEN');
          resolve();
        };
        ws.onerror = () => reject(new Error('WebSocket error'));
        ws.onclose = () => {
          ws = null;
          currentChannel = null;
          setState('IDLE');
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as { type: string };
            if (msg.type === 'left') setState('IDLE');
          } catch {
            // ignore
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  };

  const leaveChannel = async (): Promise<void> => {
    closeWs();
    setState('IDLE');
  };

  const setLocalMute = async (muted: boolean): Promise<void> => {
    localMuted = muted;
    if (currentChannel) {
      setState(muted ? 'MUTED_LOCAL' : globalMuted ? 'MUTED_GLOBAL' : 'OPEN');
    }
    notify();
  };

  const setGlobalMute = async (muted: boolean): Promise<void> => {
    globalMuted = muted;
    if (currentChannel) {
      setState(muted ? 'MUTED_GLOBAL' : localMuted ? 'MUTED_LOCAL' : 'OPEN');
    }
    notify();
  };

  const getState = (): IntercomState => state;

  const onStateChange = (listener: Listener): (() => void) => {
    listeners.push(listener);
    listener(state);
    return () => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
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
}
