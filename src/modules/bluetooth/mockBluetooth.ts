import { AudioRoute, BluetoothModule, HeadsetEventType, RiderBeacon } from './types';

const randomBeacon = (): RiderBeacon => ({
  riderId: `rider-${Math.floor(Math.random() * 1000)}`,
  rssi: -40 - Math.floor(Math.random() * 50),
  flags: Math.floor(Math.random() * 3),
});

type Listener<T> = (value: T) => void;

export interface MockBluetoothModule extends BluetoothModule {
  simulateHeadsetEvent: (event: HeadsetEventType) => void;
  simulateHelmetConnection: (connected: boolean) => void;
  simulateAudioRoute: (route: AudioRoute) => void;
}

export const createMockBluetoothModule = (): MockBluetoothModule => {
  let advertising = false;
  let scanning = false;
  let scanInterval: NodeJS.Timeout | null = null;
  let connected = true;
  let audioRoute: AudioRoute = 'BT_INTERCOM';
  const headsetListeners: Listener<HeadsetEventType>[] = [];
  const helmetListeners: Listener<boolean>[] = [];
  const audioRouteListeners: Listener<AudioRoute>[] = [];

  const startAdvertising = async (riderId: string, flags: number) => {
    advertising = true;
    console.log(`[mock bluetooth] advertising as ${riderId} with flags ${flags}`);
  };

  const stopAdvertising = async () => {
    advertising = false;
    console.log('[mock bluetooth] advertising stopped');
  };

  const startScanning = async (onBeacon: (b: RiderBeacon) => void) => {
    if (scanning) return;
    scanning = true;
    scanInterval = setInterval(() => {
      if (!advertising && !scanning) return;
      onBeacon(randomBeacon());
    }, 3000);
  };

  const stopScanning = async () => {
    scanning = false;
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
  };

  const onHeadsetEvent = (listener: (event: HeadsetEventType) => void) => {
    headsetListeners.push(listener);
    return () => {
      const index = headsetListeners.indexOf(listener);
      if (index >= 0) headsetListeners.splice(index, 1);
    };
  };

  const onHelmetConnectionChange = (listener: (state: boolean) => void) => {
    helmetListeners.push(listener);
    listener(connected);
    return () => {
      const index = helmetListeners.indexOf(listener);
      if (index >= 0) helmetListeners.splice(index, 1);
    };
  };

  const startVoiceRoute = async () => {
    audioRoute = connected ? 'BT_INTERCOM' : 'SPEAKER';
    audioRouteListeners.forEach((listener) => listener(audioRoute));
  };

  const stopVoiceRoute = async () => {
    audioRoute = connected ? 'BT_INTERCOM' : 'EARPIECE';
    audioRouteListeners.forEach((listener) => listener(audioRoute));
  };

  const onAudioRouteChange = (listener: (route: AudioRoute) => void) => {
    audioRouteListeners.push(listener);
    listener(audioRoute);
    return () => {
      const index = audioRouteListeners.indexOf(listener);
      if (index >= 0) audioRouteListeners.splice(index, 1);
    };
  };

  const simulateHeadsetEvent = (event: HeadsetEventType) => {
    headsetListeners.forEach((listener) => listener(event));
  };

  const simulateHelmetConnection = (state: boolean) => {
    connected = state;
    helmetListeners.forEach((listener) => listener(state));
    audioRoute = state ? 'BT_INTERCOM' : 'SPEAKER';
    audioRouteListeners.forEach((listener) => listener(audioRoute));
  };

  const simulateAudioRoute = (route: AudioRoute) => {
    audioRoute = route;
    audioRouteListeners.forEach((listener) => listener(route));
  };

  return {
    startAdvertising,
    stopAdvertising,
    startScanning,
    stopScanning,
    onHeadsetEvent,
    onHelmetConnectionChange,
    startVoiceRoute,
    stopVoiceRoute,
    onAudioRouteChange,
    simulateHeadsetEvent,
    simulateHelmetConnection,
    simulateAudioRoute,
  };
};
