import { Platform, PermissionsAndroid } from 'react-native';
import {
  mediaDevices,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import type { IntercomState, VoiceModule } from './types';
import { config } from '../../config';

async function requestAudioPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone for voice',
        message: 'Bike Chat needs microphone access for ride intercom.',
        buttonNeutral: 'Ask Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

type Listener = (state: IntercomState) => void;

export function createWebRTCVoiceModule(): VoiceModule {
  let state: IntercomState = 'DISABLED';
  let ws: WebSocket | null = null;
  let currentChannel: string | null = null;
  let localMuted = false;
  let globalMuted = false;
  let localStream: import('react-native-webrtc').MediaStream | null = null;
  const peerConnections = new Map<string, RTCPeerConnection>();
  const pendingIceCandidates = new Map<string, object[]>();
  const listeners: Listener[] = [];

  const notify = () => listeners.forEach((l) => l(state));

  const setState = (s: IntercomState) => {
    state = s;
    notify();
  };

  function myRiderId(): string {
    return config.getRiderId();
  }

  function sendSignalling(msg: object) {
    if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
  }

  async function getLocalAudioStream(): Promise<import('react-native-webrtc').MediaStream> {
    if (localStream) return localStream;
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    localStream = stream;
    return stream;
  }

  function closeAllPeers() {
    peerConnections.forEach((pc) => {
      pc.close();
    });
    peerConnections.clear();
    pendingIceCandidates.clear();
  }

  function stopLocalStream() {
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
  }

  function applyLocalMute() {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => {
      t.enabled = !localMuted;
    });
  }

  async function handleJoined(members: string[], channelId: string) {
    const riderId = myRiderId();
    const allowed = await requestAudioPermission();
    if (!allowed) {
      console.warn('[webrtc] Microphone permission denied');
      setState('IDLE');
      return;
    }
    try {
      const stream = await getLocalAudioStream();
      applyLocalMute();

      const peers = members.filter((id) => id !== riderId);
      for (const peerId of peers) {
        try {
          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

          stream.getTracks().forEach((track) => pc.addTrack(track, stream));

          pc.addEventListener('icecandidate', (e) => {
            const ev = e as { candidate: RTCIceCandidate | null };
            if (ev.candidate) {
              sendSignalling({
                type: 'ice',
                channelId,
                from: riderId,
                to: peerId,
                candidate: ev.candidate.toJSON(),
              });
            }
          });

          pc.addEventListener('track', () => {
            // Remote audio is played automatically by react-native-webrtc
          });

          peerConnections.set(peerId, pc);

          if (riderId < peerId) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignalling({
              type: 'offer',
              channelId,
              from: riderId,
              to: peerId,
              sdp: offer,
            });
          }
        } catch (peerErr) {
          console.warn('[webrtc] peer setup failed for', peerId, peerErr);
        }
      }
    } catch (err) {
      console.warn('[webrtc] getUserMedia or createOffer failed', err);
      setState('IDLE');
    }
  }

  async function handleOffer(
    from: string,
    sdp: RTCSessionDescription | object,
    channelId: string
  ) {
    let pc = peerConnections.get(from);
    if (!pc) {
      try {
        const stream = await getLocalAudioStream();
        applyLocalMute();
        pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        stream.getTracks().forEach((track) => pc!.addTrack(track, stream));
        pc.addEventListener('icecandidate', (e) => {
          const ev = e as { candidate: RTCIceCandidate | null };
          if (ev.candidate) {
            sendSignalling({
              type: 'ice',
              channelId,
              from: myRiderId(),
              to: from,
              candidate: ev.candidate.toJSON(),
            });
          }
        });
        pc.addEventListener('track', () => {});
        peerConnections.set(from, pc);
      } catch (err) {
        console.warn('[webrtc] getUserMedia failed for answer', err);
        return;
      }
    }

    const desc = sdp && typeof (sdp as RTCSessionDescription).type === 'string'
      ? (sdp as RTCSessionDescription)
      : new RTCSessionDescription(sdp as { type: string; sdp: string });
    await pc.setRemoteDescription(desc);

    const pending = pendingIceCandidates.get(from);
    if (pending?.length) {
      for (const c of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c as RTCIceCandidate));
        } catch (_) {}
      }
      pendingIceCandidates.delete(from);
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignalling({
      type: 'answer',
      channelId,
      from: myRiderId(),
      to: from,
      sdp: answer,
    });
  }

  async function handleAnswer(
    from: string,
    sdp: RTCSessionDescription | object
  ) {
    const pc = peerConnections.get(from);
    if (!pc) return;
    const desc = sdp && typeof (sdp as RTCSessionDescription).type === 'string'
      ? (sdp as RTCSessionDescription)
      : new RTCSessionDescription(sdp as { type: string; sdp: string });
    await pc.setRemoteDescription(desc);

    const pending = pendingIceCandidates.get(from);
    if (pending?.length) {
      for (const c of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c as RTCIceCandidate));
        } catch (_) {}
      }
      pendingIceCandidates.delete(from);
    }
  }

  async function handleIce(from: string, candidate: object) {
    const pc = peerConnections.get(from);
    const ice = new RTCIceCandidate(candidate as RTCIceCandidate);
    if (!pc || !pc.remoteDescription) {
      const pending = pendingIceCandidates.get(from) ?? [];
      pending.push(candidate);
      pendingIceCandidates.set(from, pending);
      return;
    }
    try {
      await pc.addIceCandidate(ice);
    } catch (_) {}
  }

  function handleLeft(riderId: string) {
    const pc = peerConnections.get(riderId);
    if (pc) {
      pc.close();
      peerConnections.delete(riderId);
    }
    pendingIceCandidates.delete(riderId);
  }

  const closeWs = () => {
    if (ws) {
      ws.close();
      ws = null;
    }
    currentChannel = null;
    closeAllPeers();
    stopLocalStream();
  };

  const init = async (): Promise<void> => {
    setState('IDLE');
  };

  const joinChannel = async (channelId: string): Promise<void> => {
    closeWs();
    const riderId = myRiderId();
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
          closeAllPeers();
          stopLocalStream();
          setState('IDLE');
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as {
              type: string;
              members?: string[];
              from?: string;
              riderId?: string;
              sdp?: RTCSessionDescription | object;
              candidate?: object;
            };
            if (msg.type === 'joined' && Array.isArray(msg.members)) {
              void handleJoined(msg.members, channelId).catch((e) =>
                console.warn('[webrtc] handleJoined', e)
              );
            } else if (msg.type === 'offer' && msg.from && msg.sdp) {
              void handleOffer(msg.from, msg.sdp, channelId).catch((e) =>
                console.warn('[webrtc] handleOffer', e)
              );
            } else if (msg.type === 'answer' && msg.from && msg.sdp) {
              void handleAnswer(msg.from, msg.sdp).catch((e) =>
                console.warn('[webrtc] handleAnswer', e)
              );
            } else if (msg.type === 'ice' && msg.from && msg.candidate) {
              void handleIce(msg.from, msg.candidate).catch((e) =>
                console.warn('[webrtc] handleIce', e)
              );
            } else if (msg.type === 'left' && msg.riderId) {
              handleLeft(msg.riderId);
            }
          } catch (_) {}
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
    applyLocalMute();
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

  const INPUT_LEVEL_INTERVAL_MS = 80;

  function parseLevelFromStats(stats: unknown): number {
    let level = 0;
    const reports: Array<Record<string, unknown>> = [];

    if (stats instanceof Map) {
      stats.forEach((v) => reports.push(v as Record<string, unknown>));
    } else if (Array.isArray(stats)) {
      if (stats.length === 1 && typeof stats[0] === 'string') {
        try {
          const parsed = JSON.parse(stats[0]) as unknown;
          return parseLevelFromStats(parsed);
        } catch {
          return 0;
        }
      }
      stats.forEach((pair) => {
        if (Array.isArray(pair) && pair.length === 2 && typeof pair[1] === 'object' && pair[1] !== null) {
          reports.push(pair[1] as Record<string, unknown>);
        }
      });
    } else if (typeof stats === 'object' && stats !== null && !Array.isArray(stats)) {
      reports.push(...Object.values(stats as Record<string, Record<string, unknown>>));
    }

    for (const report of reports) {
      const type = report.type as string | undefined;
      const v =
        report.audioLevel ??
        report.audioInputLevel ??
        report.level;
      if (typeof v === 'number' && v > level) {
        level = v <= 1 ? v : Math.min(1, v / 32767);
      }
      if (type === 'media-source' && typeof report.audioLevel === 'number') {
        const al = report.audioLevel as number;
        level = Math.max(level, al <= 1 ? al : Math.min(1, al / 32767));
      }
    }
    return level;
  }

  const subscribeToInputLevel = (callback: (level: number) => void): (() => void) => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled || !localStream) {
        callback(0);
        return;
      }
      const audioTrack = localStream.getAudioTracks()[0];
      const pc = peerConnections.values().next().value as RTCPeerConnection | undefined;
      if (!pc) {
        callback(0);
        return;
      }
      try {
        let stats: unknown;
        if (audioTrack) {
          try {
            stats = await pc.getStats(audioTrack);
          } catch {
            stats = await pc.getStats();
          }
        } else {
          stats = await pc.getStats();
        }
        const level = parseLevelFromStats(stats);
        if (!cancelled) callback(level);
      } catch {
        if (!cancelled) callback(0);
      }
    };
    poll();
    const id = setInterval(poll, INPUT_LEVEL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
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
    subscribeToInputLevel,
  };
}
