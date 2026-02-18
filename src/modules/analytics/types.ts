import type { IMUSample } from '../imu/types';

/** One location sample stored in the analytics buffer (timestamp + location fields). */
export type LocationSample = {
  timestamp: number;
  speedKph: number | null;
  lat: number;
  lon: number;
  headingDeg: number | null;
};

/** Velocity profile point: time and speed for charting. */
export type VelocityProfilePoint = {
  timestamp: number;
  speedKph: number;
};

/** Lean angle profile point: time and lean in degrees (positive = right, negative = left). */
export type LeanProfilePoint = {
  timestamp: number;
  leanDeg: number;
};

export type RideSummaryStats = {
  maxSpeedKph: number;
  avgSpeedKph: number;
  maxLeanLeftDeg: number;
  maxLeanRightDeg: number;
  distanceKm: number;
  timeMovingSec: number;
  timeStoppedSec: number;
};

export type RideSummary = {
  id: string;
  startedAt: number;
  endedAt: number;
  velocityProfile: VelocityProfilePoint[];
  leanProfile: LeanProfilePoint[];
  stats: RideSummaryStats;
};

/** Location type used by analytics (matches location module). */
export type LocationForAnalytics = {
  lat: number;
  lon: number;
  speedKph: number | null;
  headingDeg: number | null;
};

export type { IMUSample };
