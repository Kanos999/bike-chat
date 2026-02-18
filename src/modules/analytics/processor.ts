import type {
  LocationSample,
  LeanProfilePoint,
  RideSummary,
  RideSummaryStats,
  VelocityProfilePoint,
} from './types';
import type { IMUSample } from '../imu/types';

const SPEED_STOPPED_THRESHOLD_KPH = 2;
const MOVING_AVG_WINDOW_MS = 500;
const MAX_LOCATION_SAMPLES = 5000;
const MAX_IMU_SAMPLES = 25000;

/**
 * Build velocity profile from location samples.
 * Uses speedKph when present; optional 0.5s moving-average smoothing.
 */
export function buildVelocityProfile(samples: LocationSample[]): VelocityProfilePoint[] {
  if (samples.length === 0) return [];

  const points: VelocityProfilePoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    speedKph: s.speedKph ?? 0,
  }));

  // Optional smoothing: replace each value with average in MOVING_AVG_WINDOW_MS
  const smoothed: VelocityProfilePoint[] = points.map((p, i) => {
    const start = p.timestamp - MOVING_AVG_WINDOW_MS;
    const inWindow = points.filter((q) => q.timestamp >= start && q.timestamp <= p.timestamp);
    const avg = inWindow.length
      ? inWindow.reduce((sum, q) => sum + q.speedKph, 0) / inWindow.length
      : p.speedKph;
    return { timestamp: p.timestamp, speedKph: avg };
  });

  return smoothed;
}

/**
 * Lean angle from accelerometer (device roll).
 * Axis choice: roll in device frame = atan2(accelX, accelZ) for motorcycle lean.
 * Positive = lean right, negative = lean left. Degrees.
 */
export function leanDegFromAccel(accel: { x: number; y: number; z: number }): number {
  const rad = Math.atan2(accel.x, accel.z);
  return (rad * 180) / Math.PI;
}

/**
 * Build lean profile from IMU samples (accelerometer-based MVP).
 */
export function buildLeanProfile(samples: IMUSample[]): LeanProfilePoint[] {
  return samples.map((s) => ({
    timestamp: s.timestamp,
    leanDeg: leanDegFromAccel(s.accel),
  }));
}

/**
 * Compute ride stats from location and lean profiles.
 */
export function computeStats(
  locationSamples: LocationSample[],
  leanProfile: LeanProfilePoint[],
): RideSummaryStats {
  const velocityPoints = buildVelocityProfile(locationSamples);
  const speeds = velocityPoints.map((p) => p.speedKph).filter((v) => v >= 0);
  const maxSpeedKph = speeds.length ? Math.max(...speeds) : 0;
  const avgSpeedKph = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

  let timeMovingSec = 0;
  let timeStoppedSec = 0;
  for (let i = 1; i < locationSamples.length; i++) {
    const dt = (locationSamples[i].timestamp - locationSamples[i - 1].timestamp) / 1000;
    const speed = locationSamples[i].speedKph ?? 0;
    if (speed >= SPEED_STOPPED_THRESHOLD_KPH) timeMovingSec += dt;
    else timeStoppedSec += dt;
  }

  let distanceKm = 0;
  for (let i = 1; i < locationSamples.length; i++) {
    const a = locationSamples[i - 1];
    const b = locationSamples[i];
    distanceKm += haversineKm(a.lat, a.lon, b.lat, b.lon);
  }

  const leanDegs = leanProfile.map((p) => p.leanDeg);
  const leftLeans = leanDegs.filter((d) => d < 0);
  const rightLeans = leanDegs.filter((d) => d > 0);
  const maxLeanLeftDeg = leftLeans.length ? Math.abs(Math.min(...leftLeans)) : 0;
  const maxLeanRightDeg = rightLeans.length ? Math.max(...rightLeans) : 0;

  return {
    maxSpeedKph,
    avgSpeedKph,
    maxLeanLeftDeg,
    maxLeanRightDeg,
    distanceKm,
    timeMovingSec,
    timeStoppedSec,
  };
}

/** Haversine distance in km (simplified for small deltas). */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function createRideSummary(
  locationSamples: LocationSample[],
  imuSamples: IMUSample[],
  startedAt: number,
  endedAt: number,
): RideSummary {
  const velocityProfile = buildVelocityProfile(locationSamples);
  const leanProfile = buildLeanProfile(imuSamples);
  const stats = computeStats(locationSamples, leanProfile);
  return {
    id: `ride-${startedAt}`,
    startedAt,
    endedAt,
    velocityProfile,
    leanProfile,
    stats,
  };
}

/** Cap array to max length, keeping the most recent. */
export function capBuffer<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  return arr.slice(-max);
}

export const limits = {
  maxLocationSamples: MAX_LOCATION_SAMPLES,
  maxIMUSamples: MAX_IMU_SAMPLES,
};
