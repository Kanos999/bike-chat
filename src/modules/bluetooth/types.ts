export type RiderBeacon = {
  riderId: string;
  rssi: number;
  flags: number;
};

export type HeadsetEventType = 'LOCAL_MUTE_TOGGLE' | 'GLOBAL_MUTE_TOGGLE';

export interface BluetoothModule {
  startAdvertising(riderId: string, flags: number): Promise<void>;
  stopAdvertising(): Promise<void>;
  startScanning(onBeacon: (b: RiderBeacon) => void): Promise<void>;
  stopScanning(): Promise<void>;
  onHeadsetEvent(listener: (event: HeadsetEventType) => void): () => void;
  onHelmetConnectionChange(listener: (connected: boolean) => void): () => void;
}
