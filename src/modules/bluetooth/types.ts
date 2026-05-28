export type RiderBeacon = {
  riderId: string;
  rssi: number;
  flags: number;
};

export type HeadsetEventType = 'LOCAL_MUTE_TOGGLE' | 'GLOBAL_MUTE_TOGGLE';
export type AudioRoute = 'BT_INTERCOM' | 'WIRED_HEADSET' | 'EARPIECE' | 'SPEAKER' | 'UNKNOWN';

export interface BluetoothModule {
  startAdvertising(riderId: string, flags: number): Promise<void>;
  stopAdvertising(): Promise<void>;
  startScanning(onBeacon: (b: RiderBeacon) => void): Promise<void>;
  stopScanning(): Promise<void>;
  onHeadsetEvent(listener: (event: HeadsetEventType) => void): () => void;
  onHelmetConnectionChange(listener: (connected: boolean) => void): () => void;
  startVoiceRoute(): Promise<void>;
  stopVoiceRoute(): Promise<void>;
  onAudioRouteChange(listener: (route: AudioRoute) => void): () => void;
}
