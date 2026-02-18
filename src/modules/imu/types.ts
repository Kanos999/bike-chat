export type IMUSample = {
  accel: { x: number; y: number; z: number };
  gyro: { x: number; y: number; z: number };
  timestamp: number;
};

export interface IMUModule {
  startIMUTracking(onSample: (sample: IMUSample) => void): Promise<void>;
  stopIMUTracking(): Promise<void>;
  requestPermissions(): Promise<boolean>;
}
