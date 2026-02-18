import type { LocationForAnalytics } from './types';
import type { IMUSample } from '../imu/types';
import type { LocationSample, RideSummary } from './types';
import { createRideSummary } from './processor';
import { capBuffer, limits } from './processor';
import { getLastSummary as getStored, saveLastSummary } from './storage';

let sessionActive = false;
let sessionStartedAt = 0;
const locationSamples: LocationSample[] = [];
const imuSamples: IMUSample[] = [];

function toLocationSample(loc: LocationForAnalytics, timestamp: number): LocationSample {
  return {
    timestamp,
    speedKph: loc.speedKph,
    lat: loc.lat,
    lon: loc.lon,
    headingDeg: loc.headingDeg,
  };
}

export function startSession(): void {
  sessionActive = true;
  sessionStartedAt = Date.now();
  locationSamples.length = 0;
  imuSamples.length = 0;
}

export function onLocation(loc: LocationForAnalytics): void {
  if (!sessionActive) return;
  const sample = toLocationSample(loc, Date.now());
  locationSamples.push(sample);
  if (locationSamples.length > limits.maxLocationSamples) {
    const capped = capBuffer(locationSamples, limits.maxLocationSamples);
    locationSamples.length = 0;
    locationSamples.push(...capped);
  }
}

export function onIMUSample(sample: IMUSample): void {
  if (!sessionActive) return;
  imuSamples.push(sample);
  if (imuSamples.length > limits.maxIMUSamples) {
    const capped = capBuffer(imuSamples, limits.maxIMUSamples);
    imuSamples.length = 0;
    imuSamples.push(...capped);
  }
}

export async function endSession(): Promise<RideSummary> {
  const endedAt = Date.now();
  const summary = createRideSummary(
    [...locationSamples],
    [...imuSamples],
    sessionStartedAt,
    endedAt,
  );
  sessionActive = false;
  await saveLastSummary(summary);
  return summary;
}

export async function getLastSummary(): Promise<RideSummary | null> {
  return getStored();
}

export type { RideSummary, RideSummaryStats } from './types';
