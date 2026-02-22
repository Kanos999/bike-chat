import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { IMUSample, IMUModule } from './types';

const { IMUModule: NativeIMU } = NativeModules;

function createRealIMUModule(): IMUModule | null {
  if (Platform.OS !== 'android' || !NativeIMU) return null;

  const emitter = new NativeEventEmitter(NativeIMU);
  let subscription: { remove: () => void } | null = null;

  const startIMUTracking = async (onSample: (sample: IMUSample) => void): Promise<void> => {
    if (subscription) return;
    subscription = emitter.addListener('IMUSample', (payload: { accel: { x: number; y: number; z: number }; gyro: { x: number; y: number; z: number }; timestamp: number }) => {
      onSample({
        accel: payload.accel,
        gyro: payload.gyro,
        timestamp: payload.timestamp,
      });
    });
    NativeIMU.startIMUTracking();
  };

  const stopIMUTracking = async (): Promise<void> => {
    subscription?.remove();
    subscription = null;
    if (NativeIMU.stopIMUTracking) NativeIMU.stopIMUTracking();
  };

  const requestPermissions = async (): Promise<boolean> => true;

  return {
    startIMUTracking,
    stopIMUTracking,
    requestPermissions,
  };
}

/** Returns real IMU on Android when native module is available, otherwise null. */
export const getRealIMUModule = (): IMUModule | null => createRealIMUModule();
