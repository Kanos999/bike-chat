import { IMUSample, IMUModule } from './types';

/** Mock IMU: emits synthetic accel/gyro at ~50 Hz. Gravity on Z; small roll/yaw for realism. */
export const createMockIMUModule = (): IMUModule => {
  let tracking = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  const startIMUTracking = async (onSample: (sample: IMUSample) => void) => {
    if (tracking) return;
    tracking = true;
    const gravity = 9.81;
    const startTime = Date.now();
    const intervalMs = 20; // ~50 Hz

    interval = setInterval(() => {
      const t = (Date.now() - startTime) / 1000;
      // Plausible motorcycle: slight roll oscillation, small pitch/yaw rate
      const rollRad = Math.sin(t * 0.5) * 0.15;
      const accelX = gravity * Math.sin(rollRad);
      const accelZ = gravity * Math.cos(rollRad);
      const sample: IMUSample = {
        accel: {
          x: accelX + (Math.random() - 0.5) * 0.1,
          y: (Math.random() - 0.5) * 0.2,
          z: accelZ + (Math.random() - 0.5) * 0.1,
        },
        gyro: {
          x: Math.sin(t * 0.3) * 0.05,
          y: (Math.random() - 0.5) * 0.02,
          z: (Math.random() - 0.5) * 0.02,
        },
        timestamp: Date.now(),
      };
      onSample(sample);
    }, intervalMs);
  };

  const stopIMUTracking = async () => {
    tracking = false;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  const requestPermissions = async () => true;

  return {
    startIMUTracking,
    stopIMUTracking,
    requestPermissions,
  };
};
