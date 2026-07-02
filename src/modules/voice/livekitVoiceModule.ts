import { Platform } from 'react-native';
import { registerGlobals, AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import { Room, RoomEvent, RemoteAudioTrack } from 'livekit-client';
import type { IntercomState, VoiceModule } from './types';
import { config } from '../../config';

/**
 * LiveKit (SFU) voice module. A proximity channel maps 1:1 to a LiveKit room, so
 * any number of riders on the same channel all hear each other — no mesh, no
 * 4-participant cap. Media is forwarded by LiveKit Cloud; the client uploads its
 * mic once regardless of group size.
 *
 * Implements the same {@link VoiceModule} interface the mesh module used, so the
 * ride orchestration in rideSlice is unchanged: it still calls joinChannel /
 * leaveChannel / setLocalMute / setGlobalMute against the current channel id.
 */

let globalsRegistered = false;
function ensureGlobals(): void {
  if (globalsRegistered) return;
  registerGlobals();
  globalsRegistered = true;
}

interface VoiceTokenResponse {
  url: string;
  token: string;
  room: string;
  identity: string;
  ttl: number;
}

async function fetchVoiceToken(channelId: string): Promise<VoiceTokenResponse> {
  const riderId = config.getRiderId();
  const url =
    `${config.apiBaseUrl}/voice-token` +
    `?channelId=${encodeURIComponent(channelId)}&riderId=${encodeURIComponent(riderId)}`;
  const headers: Record<string, string> = {};
  if (config.authToken) headers.Authorization = `Bearer ${config.authToken}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`voice-token request failed: ${res.status}`);
  return (await res.json()) as VoiceTokenResponse;
}

type Listener = (state: IntercomState) => void;

export function createLiveKitVoiceModule(): VoiceModule {
  ensureGlobals();

  let state: IntercomState = 'DISABLED';
  let room: Room | null = null;
  let currentChannel: string | null = null;
  let localMuted = false;
  let globalMuted = false;
  let audioSessionActive = false;

  const listeners: Listener[] = [];
  const peerListeners: Array<(peerIds: string[]) => void> = [];

  const notify = () => listeners.forEach((l) => l(state));
  const setState = (s: IntercomState) => {
    state = s;
    notify();
  };

  const computeState = (): IntercomState => {
    if (!currentChannel) return 'IDLE';
    if (globalMuted) return 'MUTED_GLOBAL';
    if (localMuted) return 'MUTED_LOCAL';
    return 'OPEN';
  };

  const currentPeerIds = (): string[] =>
    room ? Array.from(room.remoteParticipants.values()).map((p) => p.identity).sort() : [];
  const notifyPeers = () => {
    const ids = currentPeerIds();
    peerListeners.forEach((l) => l(ids));
  };

  // Global mute silences everyone else's audio for the ride (distinct from local
  // mute, which stops *our* mic). LiveKit plays remote audio natively, so we set
  // each remote audio track's volume; newly subscribed tracks are handled on the
  // TrackSubscribed event below.
  const applyGlobalMute = () => {
    if (!room) return;
    room.remoteParticipants.forEach((p) => {
      p.audioTrackPublications.forEach((pub) => {
        const track = pub.track;
        if (track instanceof RemoteAudioTrack) {
          void track.setVolume(globalMuted ? 0 : 1);
        }
      });
    });
  };

  const attachRoomListeners = (r: Room) => {
    r.on(RoomEvent.ParticipantConnected, notifyPeers);
    r.on(RoomEvent.ParticipantDisconnected, notifyPeers);
    r.on(RoomEvent.TrackSubscribed, (track) => {
      if (track instanceof RemoteAudioTrack) {
        void track.setVolume(globalMuted ? 0 : 1);
      }
      notifyPeers();
    });
    r.on(RoomEvent.TrackUnsubscribed, notifyPeers);
    r.on(RoomEvent.Reconnected, () => {
      // Re-apply mute intent after an automatic reconnect (Wi-Fi/cellular handoff).
      applyGlobalMute();
      notifyPeers();
    });
    r.on(RoomEvent.Disconnected, () => {
      // A server-side or fatal disconnect: reflect IDLE so the UI is truthful.
      if (room === r) {
        currentChannel = null;
        setState('IDLE');
        notifyPeers();
      }
    });
  };

  const ensureAudioSession = async () => {
    if (audioSessionActive) return;
    if (Platform.OS === 'android') {
      // Prefer the Bluetooth helmet; communication preset uses MODE_IN_COMMUNICATION
      // + voice-communication attributes, matching how the intercom should route.
      await AudioSession.configureAudio({
        android: {
          preferredOutputList: ['bluetooth', 'headset', 'earpiece'],
          audioTypeOptions: AndroidAudioTypePresets.communication,
        },
      });
    }
    await AudioSession.startAudioSession();
    audioSessionActive = true;
  };

  const stopAudioSession = async () => {
    if (!audioSessionActive) return;
    audioSessionActive = false;
    try {
      await AudioSession.stopAudioSession();
    } catch {
      /* best-effort */
    }
  };

  const init = async (): Promise<void> => {
    setState('IDLE');
  };

  const joinChannel = async (channelId: string): Promise<void> => {
    // Leave any prior room first (channel change mid-ride).
    await leaveChannel();

    const tokenInfo = await fetchVoiceToken(channelId);
    await ensureAudioSession();

    const r = new Room();
    room = r;
    attachRoomListeners(r);

    await r.connect(tokenInfo.url, tokenInfo.token);
    if (room !== r) {
      // A newer join/leave superseded us while connecting.
      try {
        await r.disconnect();
      } catch {
        /* ignore */
      }
      return;
    }
    currentChannel = channelId;

    // Publish the mic. Noise suppression + high-pass (via WebRTC APM) strip wind;
    // LiveKit enables Opus DTX + RED by default, so only speech is sent and packet
    // loss is masked.
    await r.localParticipant.setMicrophoneEnabled(!localMuted, {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });

    applyGlobalMute();
    setState(computeState());
    notifyPeers();
  };

  const leaveChannel = async (): Promise<void> => {
    const r = room;
    room = null;
    currentChannel = null;
    if (r) {
      try {
        await r.disconnect();
      } catch {
        /* ignore */
      }
    }
    await stopAudioSession();
    setState('IDLE');
    notifyPeers();
  };

  const setLocalMute = async (muted: boolean): Promise<void> => {
    localMuted = muted;
    if (room) {
      try {
        await room.localParticipant.setMicrophoneEnabled(!muted);
      } catch {
        /* best-effort */
      }
    }
    setState(computeState());
  };

  const setGlobalMute = async (muted: boolean): Promise<void> => {
    globalMuted = muted;
    applyGlobalMute();
    setState(computeState());
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

  const onPeersChange = (listener: (peerIds: string[]) => void): (() => void) => {
    peerListeners.push(listener);
    listener(currentPeerIds());
    return () => {
      const i = peerListeners.indexOf(listener);
      if (i >= 0) peerListeners.splice(i, 1);
    };
  };

  // Input-level metering is left as a no-op for now (parity with the previous
  // module). LiveKit exposes participant audio levels via ActiveSpeakersChanged,
  // which can drive the visualizer in a follow-up without a getStats() loop.
  const subscribeToInputLevel = (callback: (level: number) => void): (() => void) => {
    callback(0);
    return () => callback(0);
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
}
