import { StateCreator } from 'zustand';
import { AudioRoute, HeadsetEventType } from '../modules/bluetooth/types';
import type { Location } from '../modules/location/types';
import type { NearbyChannelResponse } from '../modules/api/types';
import { config } from '../config';
import { services } from '../modules/services';
import { RideMode, RidePreference, RideSessionHandles } from './types';
import { AnalyticsSlice } from './analyticsSlice';
import { ProximitySlice } from './proximitySlice';
import { VoiceSlice } from './voiceSlice';
import { GroupsSlice } from './groupsSlice';
import { RidesSlice } from './ridesSlice';
import { saveUsername } from './profileStorage';
import type { StoredProfile } from './profileStorage';

export interface RideSlice {
  rideMode: RideMode;
  ridePreference: RidePreference | null;
  riderId: string;
  username: string;
  helmetConnected: boolean;
  audioRoute: AudioRoute;
  lastLocation: string | null;
  statusMessage: string | null;
  sessionHandles: RideSessionHandles | null;
  hydrateProfile: (profile: StoredProfile) => void;
  setUsername: (username: string) => Promise<void>;
  startRide: (preference: RidePreference) => Promise<void>;
  endRide: () => Promise<void>;
}

type Store = RideSlice & ProximitySlice & VoiceSlice & AnalyticsSlice & GroupsSlice & RidesSlice;

const formatLocation = (lat: number, lon: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
// Tuned for early pairing: poll the channel often, and refresh a stationary
// rider's presence quickly so two riders meeting up are seen within seconds
// (the previous 5s/25s values dominated the join latency, especially at low speed).
// FAST is the fallback when push isn't available; SLOW is a heartbeat that runs
// alongside the push subscription as a safety net for missed messages.
const CHANNEL_POLL_FAST_MS = 2_000;
const CHANNEL_POLL_SLOW_MS = 15_000;
const PRESENCE_KEEPALIVE_MS = 12_000;
const PRESENCE_RETRY_MS = 5_000;
const PRESENCE_MOVEMENT_THRESHOLD_METERS = 30;
const PRESENCE_MIN_MOVEMENT_SEND_INTERVAL_MS = 5_000;
const CONTROL_SOCKET_RECONNECT_MIN_MS = 1_000;
const CONTROL_SOCKET_RECONNECT_MAX_MS = 10_000;
let activeRideSessionId = 0;
// Every distinct rider that shared a channel with us this ride, accumulated across
// snapshots and persisted with the ride in endRide. Reset at startRide.
let sessionMatchedRiders = new Set<string>();

const rideLogsEnabled = (): boolean => {
  const flag = (global as any)?.__BikeChatRideLogs;
  if (flag === undefined || flag === null) return typeof __DEV__ !== 'undefined' && __DEV__;
  return Boolean(flag);
};

const logRide = (event: string, data?: Record<string, unknown>) => {
  if (!rideLogsEnabled()) return;
  // eslint-disable-next-line no-console
  console.log(`[rideSlice] ${event}`, data ?? '');
};

const invalidateRideSession = (): number => {
  activeRideSessionId += 1;
  return activeRideSessionId;
};

const isRideSessionCurrent = (sessionId: number): boolean => activeRideSessionId === sessionId;

const cleanupRideHandles = async (handles?: RideSessionHandles | null) => {
  if (!handles) return;

  if (handles.channelPollTimeout) clearTimeout(handles.channelPollTimeout);
  if (handles.presenceTimeout) clearTimeout(handles.presenceTimeout);
  if (handles.controlReconnectTimeout) clearTimeout(handles.controlReconnectTimeout);
  if (handles.controlSocket) {
    try { handles.controlSocket.close(); } catch { /* ignore */ }
    handles.controlSocket = undefined;
  }
  if (handles.unsubscribeHeadset) handles.unsubscribeHeadset();
  if (handles.unsubscribeHelmet) handles.unsubscribeHelmet();
  if (handles.unsubscribeAudioRoute) handles.unsubscribeAudioRoute();
  if (handles.unsubscribeVoice) handles.unsubscribeVoice();
  if (handles.unsubscribeVoicePeers) handles.unsubscribeVoicePeers();
  if (handles.stopIMU) await handles.stopIMU();
  if (handles.stopScanning) await handles.stopScanning();
  if (handles.stopAdvertising) await handles.stopAdvertising();
  if (handles.stopLocation) await handles.stopLocation();
};

const handleHeadsetEvent = async (event: HeadsetEventType, store: Store) => {
  if (event === 'LOCAL_MUTE_TOGGLE') {
    await store.toggleLocalMute();
  } else {
    await store.toggleGlobalMute();
  }
};

function distanceMeters(a: Pick<Location, 'lat' | 'lon'>, b: Pick<Location, 'lat' | 'lon'>): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const createRideSlice: StateCreator<
  Store,
  [['zustand/devtools', never]],
  [],
  RideSlice
> = (set, get) => ({
  rideMode: 'IDLE',
  ridePreference: null,
  riderId: '',
  username: '',
  helmetConnected: false,
  audioRoute: 'UNKNOWN',
  lastLocation: null,
  statusMessage: null,
  sessionHandles: null,
  hydrateProfile: (profile) =>
    set({ username: profile.username, riderId: profile.username }),
  setUsername: async (username) => {
    logRide('setUsername', { username });
    set({ username, riderId: username });
    await saveUsername(username);
    logRide('setUsername.saved', { username });
  },
  startRide: async (preference) => {
    const sessionId = invalidateRideSession();
    const riderId = get().riderId;
    const rideModeValue = preference === 'OPEN' ? 'OPEN' : 'FRIENDS_ONLY';
    if (!riderId.trim()) {
      if (isRideSessionCurrent(sessionId)) {
        set({ statusMessage: 'Set your username in Settings first' });
      }
      logRide('startRide.blocked.missingRiderId', { preference });
      return;
    }
    const handles: RideSessionHandles = {};
    sessionMatchedRiders = new Set<string>();
    set({ rideMode: 'INITIALISING', ridePreference: preference, statusMessage: 'Starting ride…' });
    get().clearProximity();

    logRide('startRide.begin', {
      preference,
      riderId,
      hasHelmetListener: Boolean((handles as any).unsubscribeHelmet),
    });

    const permissionsGranted = await services.location.requestPermissions();
    if (!permissionsGranted) {
      if (isRideSessionCurrent(sessionId)) {
        set({ rideMode: 'IDLE', statusMessage: 'Permissions denied' });
      }
      logRide('startRide.permissions.denied', { riderId });
      return;
    }

    if (!isRideSessionCurrent(sessionId)) {
      logRide('startRide.aborted.afterPermissions', { riderId });
      return;
    }

    logRide('startRide.permissions.granted', { riderId });

    const startedAt = Date.now();

    try {
      logRide('voice.init.begin');
      await services.voice.init();
      logRide('voice.init.ok');
      get().attachVoiceListener(handles);
      get().attachVoicePeerListener(handles);
      logRide('voice.listener.attached');

      handles.unsubscribeHeadset = services.bluetooth.onHeadsetEvent((event) => {
        if (!isRideSessionCurrent(sessionId)) return;
        logRide('bluetooth.headsetEvent', { event });
        handleHeadsetEvent(event, get());
      });

      logRide('bluetooth.headsetListener.attached');

      handles.unsubscribeHelmet = services.bluetooth.onHelmetConnectionChange((connected) => {
        if (!isRideSessionCurrent(sessionId)) return;
        set({ helmetConnected: connected });
        logRide('bluetooth.helmetConnection', { connected });
      });

      logRide('bluetooth.helmetListener.attached');

      handles.unsubscribeAudioRoute = services.bluetooth.onAudioRouteChange((route) => {
        if (!isRideSessionCurrent(sessionId)) return;
        set({ audioRoute: route });
        logRide('bluetooth.audioRoute', { route });
      });

      logRide('bluetooth.audioRouteListener.attached');

      logRide('bluetooth.startAdvertising.begin', { riderId });
      await services.bluetooth.startAdvertising(riderId, preference === 'OPEN' ? 1 : 2);
      handles.stopAdvertising = services.bluetooth.stopAdvertising;
      logRide('bluetooth.startAdvertising.ok', { riderId });

      await services.bluetooth.startVoiceRoute();
      logRide('bluetooth.voiceRoute.started');

      logRide('bluetooth.startScanning.begin');
      await services.bluetooth.startScanning((beacon) => {
        if (!isRideSessionCurrent(sessionId)) return;
        get().upsertRider(beacon);
      });
      handles.stopScanning = services.bluetooth.stopScanning;
      logRide('bluetooth.startScanning.ok');

      services.analytics.startSession();
      get().setRecording(true);
      logRide('analytics.session.started');

      const firstPresenceSent = { value: false };
      const latestLocation = { value: null as Location | null };
      const lastPresenceSent = {
        value: null as null | {
          lat: number;
          lon: number;
          rideMode: 'OPEN' | 'FRIENDS_ONLY';
          sentAt: number;
        },
      };
      const presenceRequestInFlight = { value: false };
      const channelPollInFlight = { value: false };
      const channelPollingStarted = { value: false };
      // When the control socket is live we serve channel changes by push and only
      // poll as a slow safety-net heartbeat; otherwise we fall back to fast polling.
      const pushActive = { value: false };
      const nextPollDelayMs = (): number =>
        pushActive.value ? CHANNEL_POLL_SLOW_MS : CHANNEL_POLL_FAST_MS;

      const schedulePresenceTimeout = (delayMs: number) => {
        if (handles.presenceTimeout) clearTimeout(handles.presenceTimeout);
        handles.presenceTimeout = setTimeout(() => {
          handles.presenceTimeout = undefined;
          if (!isRideSessionCurrent(sessionId)) return;
          void (async () => {
            const result = await sendPresence('keepalive');
            if (!isRideSessionCurrent(sessionId)) return;
            schedulePresenceTimeout(result === 'sent' ? PRESENCE_KEEPALIVE_MS : PRESENCE_RETRY_MS);
          })();
        }, delayMs);
      };

      const scheduleChannelPoll = (delayMs: number) => {
        if (handles.channelPollTimeout) clearTimeout(handles.channelPollTimeout);
        handles.channelPollTimeout = setTimeout(() => {
          handles.channelPollTimeout = undefined;
          if (!isRideSessionCurrent(sessionId)) return;
          void runChannelPoll();
        }, delayMs);
      };

      // Server-push channel-assignment over WebSocket. When healthy, the matcher
      // tells us about channel/member changes immediately; the poll loop above
      // backs off to a 15s heartbeat as a safety net.
      const controlSocketUrl = (): string => {
        // Avoid URLSearchParams here: RN/Hermes ships an incomplete polyfill
        // (`.set` isn't implemented), so we hand-build the query string.
        const base = config.apiBaseUrl.replace(/^http(s?):/i, 'ws$1:').replace(/\/$/, '');
        const parts = [`riderId=${encodeURIComponent(riderId)}`];
        const token = config.authToken;
        if (token) parts.push(`token=${encodeURIComponent(token)}`);
        return `${base}/presence/subscribe?${parts.join('&')}`;
      };

      let reconnectDelayMs = CONTROL_SOCKET_RECONNECT_MIN_MS;

      const openControlSocket = (): void => {
        if (!isRideSessionCurrent(sessionId)) return;
        if (handles.controlSocket) return;
        let ws: WebSocket;
        try {
          ws = new WebSocket(controlSocketUrl());
        } catch (e) {
          logRide('controlSocket.create.error', {
            message: e instanceof Error ? e.message : String(e),
          });
          scheduleControlReconnect();
          return;
        }
        handles.controlSocket = ws;

        ws.onopen = () => {
          if (!isRideSessionCurrent(sessionId)) {
            try { ws.close(); } catch {}
            return;
          }
          pushActive.value = true;
          reconnectDelayMs = CONTROL_SOCKET_RECONNECT_MIN_MS;
          logRide('controlSocket.open');
        };

        ws.onmessage = (event: WebSocketMessageEvent) => {
          if (!isRideSessionCurrent(sessionId)) return;
          try {
            const msg = JSON.parse(String(event.data)) as
              | (NearbyChannelResponse & { type: 'channel' })
              | { type: string };
            if ((msg as { type?: string }).type !== 'channel') return;
            const snap = msg as NearbyChannelResponse;
            logRide('controlSocket.channel', {
              channelId: snap.channelId,
              members: snap.members?.map((m) => m.riderId) ?? [],
            });
            void enqueueSnapshot({
              channelId: snap.channelId,
              members: Array.isArray(snap.members) ? snap.members : [],
            });
          } catch (e) {
            logRide('controlSocket.message.parse.error', {
              message: e instanceof Error ? e.message : String(e),
            });
          }
        };

        ws.onerror = () => {
          // 'close' will fire next; do the reconnect bookkeeping there.
        };

        ws.onclose = () => {
          pushActive.value = false;
          if (handles.controlSocket === ws) handles.controlSocket = undefined;
          logRide('controlSocket.close');
          if (!isRideSessionCurrent(sessionId)) return;
          scheduleControlReconnect();
          // Fall back to fast polling immediately so the safety-net heartbeat
          // shortens to ~2s while the push is down.
          if (channelPollingStarted.value) scheduleChannelPoll(0);
        };
      };

      const scheduleControlReconnect = (): void => {
        if (handles.controlReconnectTimeout) clearTimeout(handles.controlReconnectTimeout);
        const delay = reconnectDelayMs;
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, CONTROL_SOCKET_RECONNECT_MAX_MS);
        handles.controlReconnectTimeout = setTimeout(() => {
          handles.controlReconnectTimeout = undefined;
          openControlSocket();
        }, delay);
      };

      const ensureChannelPollingStarted = () => {
        if (channelPollingStarted.value) return;
        channelPollingStarted.value = true;
        logRide('channel.poll.started', { intervalMs: nextPollDelayMs() });
        scheduleChannelPoll(0);
        openControlSocket();
      };

      const sendPresence = async (
        source: 'location' | 'keepalive' | 'shutdown',
        rideModeOverride?: 'OFF' | 'OPEN' | 'FRIENDS_ONLY'
      ): Promise<'sent' | 'skipped' | 'failed'> => {
        const loc = latestLocation.value;
        if (!loc) return 'skipped';
        if (presenceRequestInFlight.value && source !== 'shutdown') return 'skipped';

        const now = Date.now();
        const nextRideMode = rideModeOverride ?? rideModeValue;
        const last = lastPresenceSent.value;
        const movementMeters = last ? distanceMeters(last, loc) : Number.POSITIVE_INFINITY;
        const movedEnough = movementMeters >= PRESENCE_MOVEMENT_THRESHOLD_METERS;
        const modeChanged = !last || last.rideMode !== nextRideMode;
        const staleEnough = !last || now - last.sentAt >= PRESENCE_KEEPALIVE_MS;
        const movementIntervalReached =
          !last || now - last.sentAt >= PRESENCE_MIN_MOVEMENT_SEND_INTERVAL_MS;
        const shouldSend =
          nextRideMode === 'OFF' ||
          !last ||
          modeChanged ||
          staleEnough ||
          (movedEnough && movementIntervalReached);

        if (!shouldSend) return 'skipped';

        presenceRequestInFlight.value = true;
        try {
          logRide(`api.updatePresence.${source}.begin`, {
            riderId,
            rideMode: nextRideMode,
          });
          await services.apiClient.updatePresence({
            riderId,
            lat: loc.lat,
            lon: loc.lon,
            rideMode: nextRideMode,
            timestamp: now,
            headingDeg: loc.headingDeg,
            speedKph: loc.speedKph,
            // FRIENDS_ONLY rides are scoped to the active crew; blocks apply always.
            groupId: nextRideMode === 'FRIENDS_ONLY' ? get().activeGroupId : null,
            blockedRiderIds: get().blockedUsernames,
          });

          if (!isRideSessionCurrent(sessionId)) return 'sent';

          if (nextRideMode === 'OFF') {
            lastPresenceSent.value = null;
          } else {
            lastPresenceSent.value = {
              lat: loc.lat,
              lon: loc.lon,
              rideMode: nextRideMode,
              sentAt: now,
            };
          }

          if (!firstPresenceSent.value && nextRideMode !== 'OFF') {
            firstPresenceSent.value = true;
            logRide('api.updatePresence.firstOk', { msSinceStart: Date.now() - startedAt });
            ensureChannelPollingStarted();
          } else {
            logRide(`api.updatePresence.${source}.ok`, { rideMode: nextRideMode });
          }

          return 'sent';
        } catch (e) {
          if (!isRideSessionCurrent(sessionId)) return 'failed';
          logRide(`api.updatePresence.${source}.error`, {
            message: e instanceof Error ? e.message : String(e),
          });
          set({ statusMessage: `Presence failed: ${e instanceof Error ? e.message : 'Unknown error'}` });
          return 'failed';
        } finally {
          presenceRequestInFlight.value = false;
        }
      };

      // Shared snapshot handler: identical voice-join/leave + statusMessage flow
      // whether the snapshot came from a REST poll or a WS push.
      let applyChain: Promise<void> = Promise.resolve();
      const applyChannelSnapshot = async (response: NearbyChannelResponse): Promise<void> => {
        if (!isRideSessionCurrent(sessionId)) return;
        // Note: the rider-join alert fires off the actual WebRTC peer-connect event
        // (see voiceSlice.attachVoicePeerListener), not channel-membership churn.
        get().setMatchedRiders(response.members);
        // Accumulate everyone we shared a channel with, for the ride history.
        for (const m of response.members) sessionMatchedRiders.add(m.riderId);
        const current = get().currentChannelId;
        if (response.channelId !== current) {
          if (response.channelId) {
            get().setChannel(response.channelId, true);
            try {
              logRide('voice.joinChannel.begin', { channelId: response.channelId });
              await services.voice.joinChannel(response.channelId);
              if (!isRideSessionCurrent(sessionId)) {
                await services.voice.leaveChannel();
                return;
              }
              logRide('voice.joinChannel.ok', { channelId: response.channelId });
              set({ statusMessage: `Connected to ${response.members.length + 1} rider channel` });
            } catch (e) {
              if (!isRideSessionCurrent(sessionId)) return;
              logRide('voice.joinChannel.error', {
                channelId: response.channelId,
                message: e instanceof Error ? e.message : String(e),
              });
              set({
                statusMessage: `Channel assigned, but voice failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
              });
            }
          } else if (current) {
            get().setChannel(null, false);
            try {
              logRide('voice.leaveChannel.begin', { channelId: current });
              await services.voice.leaveChannel();
              if (!isRideSessionCurrent(sessionId)) return;
              logRide('voice.leaveChannel.ok', { channelId: current });
            } catch (e) {
              if (!isRideSessionCurrent(sessionId)) return;
              logRide('voice.leaveChannel.error', {
                channelId: current,
                message: e instanceof Error ? e.message : String(e),
              });
            }
            set({
              statusMessage: response.members.length > 0 ? 'Riders nearby, waiting for shared channel' : 'Ride active',
            });
          }
        } else if (response.channelId) {
          set({ statusMessage: `Channel live with ${response.members.length + 1} riders nearby` });
        } else {
          set({ statusMessage: response.members.length > 0 ? 'Riders nearby, waiting for shared channel' : 'Ride active' });
        }
      };
      // Serialize applies so push + poll can't race into double-join/leave.
      const enqueueSnapshot = (response: NearbyChannelResponse): Promise<void> => {
        applyChain = applyChain.then(() => applyChannelSnapshot(response)).catch(() => {});
        return applyChain;
      };

      const runChannelPoll = async (): Promise<void> => {
        if (!channelPollingStarted.value) return;
        if (channelPollInFlight.value) {
          scheduleChannelPoll(nextPollDelayMs());
          return;
        }

        channelPollInFlight.value = true;
        try {
          logRide('api.getAssignedChannel.begin', { riderId: get().riderId });
          const response = await services.apiClient.getAssignedChannel(get().riderId);
          if (!isRideSessionCurrent(sessionId)) return;
          logRide('api.getAssignedChannel.ok', {
            channelId: response.channelId,
            members: response.members.map((member) => member.riderId),
          });
          await enqueueSnapshot(response);
        } catch (e) {
          if (!isRideSessionCurrent(sessionId)) return;
          logRide('api.getAssignedChannel.error', {
            message: e instanceof Error ? e.message : String(e),
          });
          set({ statusMessage: `Channel poll failed: ${e instanceof Error ? e.message : 'Unknown error'}` });
        } finally {
          channelPollInFlight.value = false;
          if (isRideSessionCurrent(sessionId) && channelPollingStarted.value) {
            scheduleChannelPoll(nextPollDelayMs());
          }
        }
      };

      await services.location.startTracking((loc) => {
        if (!isRideSessionCurrent(sessionId)) return;
        latestLocation.value = loc;
        set({ lastLocation: formatLocation(loc.lat, loc.lon) });
        services.analytics.onLocation(loc);

        logRide('location.update', {
          lat: Number(loc.lat.toFixed(5)),
          lon: Number(loc.lon.toFixed(5)),
          speedKph: loc.speedKph,
          headingDeg: loc.headingDeg,
        });

        void sendPresence('location').then((result) => {
          if (!isRideSessionCurrent(sessionId)) return;
          if (result === 'sent') {
            schedulePresenceTimeout(PRESENCE_KEEPALIVE_MS);
          } else if (result === 'failed') {
            schedulePresenceTimeout(PRESENCE_RETRY_MS);
          }
        });
      });
      handles.stopLocation = services.location.stopTracking;
      logRide('location.tracking.started');

      logRide('imu.start.begin');
      await services.imu.startIMUTracking((sample) => services.analytics.onIMUSample(sample));
      handles.stopIMU = services.imu.stopIMUTracking;
      logRide('imu.start.ok');
    } catch (error) {
      logRide('startRide.error', {
        message: error instanceof Error ? error.message : String(error),
      });
      await cleanupRideHandles(handles);
      if (isRideSessionCurrent(sessionId)) {
        await services.bluetooth.stopVoiceRoute();
        await services.voice.leaveChannel();
        get().setRecording(false);
        set({
          rideMode: 'IDLE',
          ridePreference: null,
          statusMessage: `Ride start failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          sessionHandles: null,
        });
      }
      return;
    }

    if (!isRideSessionCurrent(sessionId)) {
      logRide('startRide.aborted.beforeActivate', { riderId });
      await cleanupRideHandles(handles);
      await services.bluetooth.stopVoiceRoute();
      await services.voice.leaveChannel();
      get().setRecording(false);
      return;
    }

    logRide('startRide.success', { preference, riderId, msSinceStart: Date.now() - startedAt });
    set({
      rideMode: preference === 'OPEN' ? 'ACTIVE_OPEN' : 'ACTIVE_FRIENDS_ONLY',
      statusMessage: 'Ride active',
      sessionHandles: handles,
    });
  },
  endRide: async () => {
    const endedSessionId = invalidateRideSession();
    logRide('endRide.begin');
    const handles = get().sessionHandles;
    const riderId = get().riderId;
    const last = get().lastLocation;

    // Capture ride context before the reset below clears it, for the history record.
    const endedMode = get().ridePreference === 'FRIENDS_ONLY' ? 'FRIENDS_ONLY' : 'OPEN';
    const endedGroupId = endedMode === 'FRIENDS_ONLY' ? get().activeGroupId : null;
    const endedMatched = Array.from(sessionMatchedRiders);

    // Invalidate the active ride immediately, then let teardown finish in the background.
    get().setRecording(false);
    get().clearProximity();
    get().setIntercomState('IDLE');
    set({
      rideMode: 'IDLE',
      ridePreference: null,
      statusMessage: null,
      sessionHandles: null,
      audioRoute: 'UNKNOWN',
      helmetConnected: false,
      connectedPeerIds: [],
    });

    await cleanupRideHandles(handles);
    await services.bluetooth.stopVoiceRoute();
    if (riderId && last) {
      const [lat, lon] = last.split(',').map((val) => parseFloat(val.trim()));
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        try {
          await services.apiClient.updatePresence({
            riderId,
            lat,
            lon,
            rideMode: 'OFF',
            timestamp: Date.now(),
          });
        } catch (e) {
          logRide('api.updatePresence.off.error', {
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    const summary = await services.analytics.endSession();
    get().setLastSummary(summary);
    // Persist the ride + the riders we matched with to history (best-effort).
    void get().saveRide(summary, endedMode, endedGroupId, endedMatched);

    logRide('analytics.session.ended');

    await services.voice.leaveChannel();
    if (isRideSessionCurrent(endedSessionId)) {
      set({
        connectedPeerIds: [],
      } as Partial<Store>);
    }

    logRide('endRide.done');
  },
});
