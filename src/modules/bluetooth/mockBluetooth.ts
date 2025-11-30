import { BluetoothModule, HeadsetEventType, RiderBeacon } from './types';

const randomBeacon = (): RiderBeacon => ({
  riderId: `rider-${Math.floor(Math.random() * 1000)}`,
  rssi: -40 - Math.floor(Math.random() * 50),
  flags: Math.floor(Math.random() * 3),
});

type Listener<T> = (value: T) => void;

export interface MockBluetoothModule extends BluetoothModule {
  simulateHeadsetEvent: (event: HeadsetEventType) => void;
  simulateHelmetConnection: (connected: boolean) => void;
}

export const createMockBluetoothModule = (): MockBluetoothModule => {
  let advertising = false;
  let scanning = false;
  let scanInterval: NodeJS.Timeout | null = null;
  let connected = true;
  const headsetListeners: Listener<HeadsetEventType>[] = [];
  const helmetListeners: Listener<boolean>[] = [];

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

  const simulateHeadsetEvent = (event: HeadsetEventType) => {
    headsetListeners.forEach((listener) => listener(event));
  };

  const simulateHelmetConnection = (state: boolean) => {
    connected = state;
    helmetListeners.forEach((listener) => listener(state));
  };

  return {
    startAdvertising,
    stopAdvertising,
    startScanning,
    stopScanning,
    onHeadsetEvent,
    onHelmetConnectionChange,
    simulateHeadsetEvent,
    simulateHelmetConnection,
  };
};
