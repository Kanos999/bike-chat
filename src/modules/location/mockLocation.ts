import { Location, LocationModule } from './types';

const baseLocation: Location = {
  lat: 37.7749,
  lon: -122.4194,
  speedKph: 0,
  headingDeg: 0,
};

export const createMockLocationModule = (): LocationModule => {
  let tracking = false;
  let interval: NodeJS.Timeout | null = null;

  const startTracking = async (onLocation: (loc: Location) => void) => {
    if (tracking) return;
    tracking = true;
    let tick = 0;
    interval = setInterval(() => {
      tick += 1;
      const delta = tick * 0.0001;
      const next: Location = {
        ...baseLocation,
        lat: baseLocation.lat + delta,
        lon: baseLocation.lon + delta,
        speedKph: 60 + Math.sin(tick / 5) * 5,
        headingDeg: (tick * 10) % 360,
      };
      onLocation(next);
    }, 2000);
  };

  const stopTracking = async () => {
    tracking = false;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  const requestPermissions = async () => true;

  return {
    startTracking,
    stopTracking,
    requestPermissions,
  };
};
