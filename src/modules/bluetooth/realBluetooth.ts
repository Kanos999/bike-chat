import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { AudioRoute, BluetoothModule, HeadsetEventType, RiderBeacon } from './types';

const { BleModule: NativeBle } = NativeModules;

function createRealBluetoothModule(): BluetoothModule | null {
  if (Platform.OS !== 'android' || !NativeBle) return null;

  const emitter = new NativeEventEmitter(NativeBle);
  let beaconSub: { remove: () => void } | null = null;
  let headsetSub: { remove: () => void } | null = null;
  let helmetSub: { remove: () => void } | null = null;
  let audioRouteSub: { remove: () => void } | null = null;

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

  const startVoiceRoute = async (): Promise<void> => {
    NativeBle.startVoiceRoute();
  };

  const stopVoiceRoute = async (): Promise<void> => {
    NativeBle.stopVoiceRoute();
  };

  const playJoinTone = (kind: string): void => {
    if (typeof NativeBle.playJoinTone === 'function') {
      try {
        NativeBle.playJoinTone(kind);
      } catch {
        /* best-effort alert */
      }
    }
  };

  const playLeaveTone = (kind: string): void => {
    if (typeof NativeBle.playLeaveTone === 'function') {
      try {
        NativeBle.playLeaveTone(kind);
      } catch {
        /* best-effort alert */
      }
    }
  };

  const onAudioRouteChange = (listener: (route: AudioRoute) => void): (() => void) => {
    audioRouteSub = emitter.addListener('BleAudioRoute', (payload: { route: AudioRoute }) => {
      listener(payload.route);
    });
    if (typeof NativeBle.getCurrentAudioRoute === 'function') {
      Promise.resolve(NativeBle.getCurrentAudioRoute())
        .then((route: AudioRoute) => listener(route))
        .catch(() => {});
    } else {
      listener('UNKNOWN');
    }
    return () => {
      audioRouteSub?.remove();
      audioRouteSub = null;
    };
  };

  const module: BluetoothModule = {
    startAdvertising,
    stopAdvertising,
    startScanning,
    stopScanning,
    onHeadsetEvent,
    onHelmetConnectionChange,
    startVoiceRoute,
    stopVoiceRoute,
    onAudioRouteChange,
    playJoinTone,
    playLeaveTone,
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
