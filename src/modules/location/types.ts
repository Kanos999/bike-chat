export type Location = {
  lat: number;
  lon: number;
  speedKph: number | null;
  headingDeg: number | null;
};

export interface LocationModule {
  startTracking(onLocation: (loc: Location) => void): Promise<void>;
  stopTracking(): Promise<void>;
  requestPermissions(): Promise<boolean>;
}
