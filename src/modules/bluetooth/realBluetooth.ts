import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { BluetoothModule, HeadsetEventType, RiderBeacon } from './types';

const { BleModule: NativeBle } = NativeModules;

function createRealBluetoothModule(): BluetoothModule | null {
  if (Platform.OS !== 'android' || !NativeBle) return null;

  const emitter = new NativeEventEmitter(NativeBle);
  let beaconSub: { remove: () => void } | null = null;
  let headsetSub: { remove: () => void } | null = null;
  let helmetSub: { remove: () => void } | null = null;

  const startAdvertising = async (riderId: string, flags: number): Promise<void> => {
    NativeBle.startAdvertising(riderId, flags);
  };

  const stopAdvertising = async (): Promise<void> => {
    NativeBle.stopAdvertising();
  };

  const startScanning = async (onBeacon: (b: RiderBeacon) => void): Promise<void> => {
    if (beaconSub) return;
    beaconSub = emitter.addListener(
      'BleBeacon',
      (payload: { riderId: string; rssi: number; flags: number }) => {
        onBeacon({
          riderId: payload.riderId,
          rssi: payload.rssi,
          flags: payload.flags,
        });
      }
    );
    NativeBle.startScanning();
  };

  const stopScanning = async (): Promise<void> => {
    beaconSub?.remove();
    beaconSub = null;
    NativeBle.stopScanning();
  };

  const onHeadsetEvent = (listener: (event: HeadsetEventType) => void): (() => void) => {
    headsetSub = emitter.addListener(
      'BleHeadsetEvent',
      (payload: { event: string }) => {
        if (payload.event === 'LOCAL_MUTE_TOGGLE' || payload.event === 'GLOBAL_MUTE_TOGGLE') {
          listener(payload.event);
        }
      }
    );
    return () => {
      headsetSub?.remove();
      headsetSub = null;
    };
  };

  const onHelmetConnectionChange = (listener: (connected: boolean) => void): (() => void) => {
    listener(false);
    helmetSub = emitter.addListener('BleHelmetConnection', (payload: { connected: boolean }) => {
      listener(payload.connected);
    });
    return () => {
      helmetSub?.remove();
      helmetSub = null;
    };
  };

  const module: BluetoothModule = {
    startAdvertising,
    stopAdvertising,
    startScanning,
    stopScanning,
    onHeadsetEvent,
    onHelmetConnectionChange,
  };
  return Object.assign(module, {
    simulateHeadsetEvent: (_event: HeadsetEventType) => {},
    simulateHelmetConnection: (_connected: boolean) => {},
  }) as BluetoothModule & {
    simulateHeadsetEvent: (event: HeadsetEventType) => void;
    simulateHelmetConnection: (connected: boolean) => void;
  };
}

/** Returns real BLE module on Android when native BleModule is available, otherwise null. */
export const getRealBluetoothModule = (): BluetoothModule | null => createRealBluetoothModule();
