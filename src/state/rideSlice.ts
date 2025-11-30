import { StateCreator } from 'zustand';
import { HeadsetEventType } from '../modules/bluetooth/types';
import { services } from '../modules/services';
import { RideMode, RidePreference, RideSessionHandles } from './types';
import { ProximitySlice } from './proximitySlice';
import { VoiceSlice } from './voiceSlice';

export interface RideSlice {
  rideMode: RideMode;
  ridePreference: RidePreference | null;
  riderId: string;
  helmetConnected: boolean;
  lastLocation: string | null;
  statusMessage: string | null;
  sessionHandles: RideSessionHandles | null;
  startRide: (preference: RidePreference) => Promise<void>;
  endRide: () => Promise<void>;
}

type Store = RideSlice & ProximitySlice & VoiceSlice;

const formatLocation = (lat: number, lon: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

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
  riderId: `rider-${Math.floor(Math.random() * 10000)}`,
  helmetConnected: false,
  lastLocation: null,
  statusMessage: null,
  sessionHandles: null,
  startRide: async (preference) => {
    const riderId = get().riderId;
    const handles: RideSessionHandles = {};
    set({ rideMode: 'INITIALISING', ridePreference: preference, statusMessage: 'Starting ride…' });
    get().clearProximity();

    const permissionsGranted = await services.location.requestPermissions();
    if (!permissionsGranted) {
      set({ rideMode: 'IDLE', statusMessage: 'Permissions denied' });
      return;
    }

    await services.voice.init();
    get().attachVoiceListener(handles);

    handles.unsubscribeHeadset = services.bluetooth.onHeadsetEvent((event) => {
      handleHeadsetEvent(event, get());
    });

    handles.unsubscribeHelmet = services.bluetooth.onHelmetConnectionChange((connected) => {
      set({ helmetConnected: connected });
    });

    await services.bluetooth.startAdvertising(riderId, preference === 'OPEN' ? 1 : 2);
    handles.stopAdvertising = services.bluetooth.stopAdvertising;

    await services.bluetooth.startScanning((beacon) => get().upsertRider(beacon));
    handles.stopScanning = services.bluetooth.stopScanning;

    await services.location.startTracking(async (loc) => {
      set({ lastLocation: formatLocation(loc.lat, loc.lon) });
      await services.apiClient.updatePresence({
        riderId,
        lat: loc.lat,
        lon: loc.lon,
        rideMode: preference === 'OPEN' ? 'OPEN' : 'FRIENDS_ONLY',
        timestamp: Date.now(),
      });
    });
    handles.stopLocation = services.location.stopTracking;

    handles.channelInterval = setInterval(async () => {
      const response = await services.apiClient.getAssignedChannel();
      const current = get().currentChannelId;
      if (response.channelId !== current) {
        if (response.channelId) {
          await services.voice.joinChannel(response.channelId);
          get().setChannel(response.channelId, true);
        } else if (current) {
          await services.voice.leaveChannel();
          get().setChannel(null, false);
        }
      }
    }, 5000);

    handles.presenceInterval = setInterval(async () => {
      const last = get().lastLocation;
      if (last) {
        const [lat, lon] = last.split(',').map((val) => parseFloat(val.trim()));
        await services.apiClient.updatePresence({
          riderId,
          lat,
          lon,
          rideMode: preference === 'OPEN' ? 'OPEN' : 'FRIENDS_ONLY',
          timestamp: Date.now(),
        });
      }
    }, 8000);

    set({
      rideMode: preference === 'OPEN' ? 'ACTIVE_OPEN' : 'ACTIVE_FRIENDS_ONLY',
      statusMessage: 'Ride active',
      sessionHandles: handles,
    });
  },
  endRide: async () => {
    const handles = get().sessionHandles;
    if (handles?.channelInterval) clearInterval(handles.channelInterval);
    if (handles?.presenceInterval) clearInterval(handles.presenceInterval);
    if (handles?.unsubscribeHeadset) handles.unsubscribeHeadset();
    if (handles?.unsubscribeHelmet) handles.unsubscribeHelmet();
    if (handles?.unsubscribeVoice) handles.unsubscribeVoice();
    if (handles?.stopScanning) await handles.stopScanning();
    if (handles?.stopAdvertising) await handles.stopAdvertising();
    if (handles?.stopLocation) await handles.stopLocation();

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
  },
});
