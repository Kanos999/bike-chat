import { StateCreator } from 'zustand';
import { HeadsetEventType } from '../modules/bluetooth/types';
import { services } from '../modules/services';
import { RideMode, RidePreference, RideSessionHandles } from './types';
import { AnalyticsSlice } from './analyticsSlice';
import { ProximitySlice } from './proximitySlice';
import { VoiceSlice } from './voiceSlice';
import { saveProfile } from './profileStorage';
import type { StoredProfile } from './profileStorage';

export interface RideSlice {
  rideMode: RideMode;
  ridePreference: RidePreference | null;
  riderId: string;
  username: string;
  helmetConnected: boolean;
  lastLocation: string | null;
  statusMessage: string | null;
  sessionHandles: RideSessionHandles | null;
  hydrateProfile: (profile: StoredProfile) => void;
  setUsername: (username: string) => Promise<void>;
  startRide: (preference: RidePreference) => Promise<void>;
  endRide: () => Promise<void>;
}

type Store = RideSlice & ProximitySlice & VoiceSlice & AnalyticsSlice;

const formatLocation = (lat: number, lon: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

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

const handleHeadsetEvent = async (event: HeadsetEventType, store: Store) => {
  if (event === 'LOCAL_MUTE_TOGGLE') {
    await store.toggleLocalMute();
  } else {
    await store.toggleGlobalMute();
  }
};

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
  lastLocation: null,
  statusMessage: null,
  sessionHandles: null,
  hydrateProfile: (profile) =>
    set({ username: profile.username, riderId: profile.username }),
  setUsername: async (username) => {
    logRide('setUsername', { username });
    set({ username, riderId: username });
    await saveProfile({ username });
    logRide('setUsername.saved', { username });
  },
  startRide: async (preference) => {
    const riderId = get().riderId;
    if (!riderId.trim()) {
      set({ statusMessage: 'Set your username in Settings first' });
      logRide('startRide.blocked.missingRiderId', { preference });
      return;
    }
    const handles: RideSessionHandles = {};
    set({ rideMode: 'INITIALISING', ridePreference: preference, statusMessage: 'Starting ride…' });
    get().clearProximity();

    logRide('startRide.begin', {
      preference,
      riderId,
      hasHelmetListener: Boolean((handles as any).unsubscribeHelmet),
    });

    const permissionsGranted = await services.location.requestPermissions();
    if (!permissionsGranted) {
      set({ rideMode: 'IDLE', statusMessage: 'Permissions denied' });
      logRide('startRide.permissions.denied', { riderId });
      return;
    }

    logRide('startRide.permissions.granted', { riderId });

    const startedAt = Date.now();

    try {
      logRide('voice.init.begin');
      await services.voice.init();
      logRide('voice.init.ok');
      get().attachVoiceListener(handles);
      logRide('voice.listener.attached');

      handles.unsubscribeHeadset = services.bluetooth.onHeadsetEvent((event) => {
        logRide('bluetooth.headsetEvent', { event });
        handleHeadsetEvent(event, get());
      });

      logRide('bluetooth.headsetListener.attached');

      handles.unsubscribeHelmet = services.bluetooth.onHelmetConnectionChange((connected) => {
        set({ helmetConnected: connected });
        logRide('bluetooth.helmetConnection', { connected });
      });

      logRide('bluetooth.helmetListener.attached');

      logRide('bluetooth.startAdvertising.begin', { riderId });
      await services.bluetooth.startAdvertising(riderId, preference === 'OPEN' ? 1 : 2);
      handles.stopAdvertising = services.bluetooth.stopAdvertising;
      logRide('bluetooth.startAdvertising.ok', { riderId });

      logRide('bluetooth.startScanning.begin');
      await services.bluetooth.startScanning((beacon) => get().upsertRider(beacon));
      handles.stopScanning = services.bluetooth.stopScanning;
      logRide('bluetooth.startScanning.ok');

      services.analytics.startSession();
      get().setRecording(true);
      logRide('analytics.session.started');

      const firstPresenceSent = { value: false };

      await services.location.startTracking(async (loc) => {
        set({ lastLocation: formatLocation(loc.lat, loc.lon) });
        services.analytics.onLocation(loc);

        logRide('location.update', {
          lat: Number(loc.lat.toFixed(5)),
          lon: Number(loc.lon.toFixed(5)),
          speedKph: loc.speedKph,
          headingDeg: loc.headingDeg,
        });

        try {
          logRide('api.updatePresence.begin', {
            riderId,
            rideMode: preference === 'OPEN' ? 'OPEN' : 'FRIENDS_ONLY',
          });
          await services.apiClient.updatePresence({
            riderId,
            lat: loc.lat,
            lon: loc.lon,
            rideMode: preference === 'OPEN' ? 'OPEN' : 'FRIENDS_ONLY',
            timestamp: Date.now(),
          });

          if (!firstPresenceSent.value) {
            firstPresenceSent.value = true;
            logRide('api.updatePresence.firstOk', { msSinceStart: Date.now() - startedAt });
          } else {
            logRide('api.updatePresence.ok');
          }
        } catch (e) {
          logRide('api.updatePresence.error', {
            message: e instanceof Error ? e.message : String(e),
          });
          set({ statusMessage: `Presence failed: ${e instanceof Error ? e.message : 'Unknown error'}` });
        }
      });
      handles.stopLocation = services.location.stopTracking;
      logRide('location.tracking.started');

      logRide('imu.start.begin');
      await services.imu.startIMUTracking((sample) => services.analytics.onIMUSample(sample));
      handles.stopIMU = services.imu.stopIMUTracking;
      logRide('imu.start.ok');

      handles.channelInterval = setInterval(async () => {
        try {
          logRide('api.getAssignedChannel.begin', { riderId: get().riderId });
          const response = await services.apiClient.getAssignedChannel(get().riderId);
          logRide('api.getAssignedChannel.ok', { channelId: response.channelId });
          const current = get().currentChannelId;
          if (response.channelId !== current) {
            if (response.channelId) {
              logRide('voice.joinChannel.begin', { channelId: response.channelId });
              await services.voice.joinChannel(response.channelId);
              get().setChannel(response.channelId, true);
              logRide('voice.joinChannel.ok', { channelId: response.channelId });
            } else if (current) {
              logRide('voice.leaveChannel.begin', { channelId: current });
              await services.voice.leaveChannel();
              get().setChannel(null, false);
              logRide('voice.leaveChannel.ok', { channelId: current });
            }
          }
        } catch (e) {
          logRide('api.getAssignedChannel.error', {
            message: e instanceof Error ? e.message : String(e),
          });
          set({ statusMessage: `Channel poll failed: ${e instanceof Error ? e.message : 'Unknown error'}` });
        }
      }, 5000);
      logRide('channel.poll.started', { intervalMs: 5000 });

      handles.presenceInterval = setInterval(async () => {
        const last = get().lastLocation;
        if (last) {
          const [lat, lon] = last.split(',').map((val) => parseFloat(val.trim()));
          try {
            logRide('api.updatePresence.interval.begin', { riderId });
            await services.apiClient.updatePresence({
              riderId,
              lat,
              lon,
              rideMode: preference === 'OPEN' ? 'OPEN' : 'FRIENDS_ONLY',
              timestamp: Date.now(),
            });
            logRide('api.updatePresence.interval.ok');
          } catch (e) {
            logRide('api.updatePresence.interval.error', {
              message: e instanceof Error ? e.message : String(e),
            });
            set({ statusMessage: `Presence failed: ${e instanceof Error ? e.message : 'Unknown error'}` });
          }
        }
      }, 8000);
      logRide('presence.interval.started', { intervalMs: 8000 });
    } catch (error) {
      logRide('startRide.error', {
        message: error instanceof Error ? error.message : String(error),
      });
      if (handles.channelInterval) clearInterval(handles.channelInterval);
      if (handles.presenceInterval) clearInterval(handles.presenceInterval);
      if (handles.unsubscribeHeadset) handles.unsubscribeHeadset();
      if (handles.unsubscribeHelmet) handles.unsubscribeHelmet();
      if (handles.unsubscribeVoice) handles.unsubscribeVoice();
      if (handles.stopIMU) await handles.stopIMU();
      if (handles.stopScanning) await handles.stopScanning();
      if (handles.stopAdvertising) await handles.stopAdvertising();
      if (handles.stopLocation) await handles.stopLocation();
      await services.voice.leaveChannel();
      get().setRecording(false);
      set({
        rideMode: 'IDLE',
        ridePreference: null,
        statusMessage: `Ride start failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sessionHandles: null,
      });
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
    logRide('endRide.begin');
    const handles = get().sessionHandles;
    if (handles?.channelInterval) clearInterval(handles.channelInterval);
    if (handles?.presenceInterval) clearInterval(handles.presenceInterval);
    if (handles?.unsubscribeHeadset) handles.unsubscribeHeadset();
    if (handles?.unsubscribeHelmet) handles.unsubscribeHelmet();
    if (handles?.unsubscribeVoice) handles.unsubscribeVoice();
    if (handles?.stopIMU) await handles.stopIMU();
    if (handles?.stopScanning) await handles.stopScanning();
    if (handles?.stopAdvertising) await handles.stopAdvertising();
    if (handles?.stopLocation) await handles.stopLocation();

    const summary = await services.analytics.endSession();
    get().setLastSummary(summary);
    get().setRecording(false);

    logRide('analytics.session.ended');

    await services.voice.leaveChannel();
    get().clearProximity();
    get().setIntercomState('IDLE');

    set({
      rideMode: 'ENDED',
      ridePreference: null,
      statusMessage: 'Ride ended',
      sessionHandles: null,
    });

    setTimeout(() => set({ rideMode: 'IDLE', statusMessage: null }), 300);

    logRide('endRide.done');
  },
});
