import { RiderBeacon } from '../bluetooth/types';

export const upsertBeacon = (
  list: RiderBeacon[],
  next: RiderBeacon,
): RiderBeacon[] => {
  const existingIndex = list.findIndex((b) => b.riderId === next.riderId);
  if (existingIndex >= 0) {
    const existing = list[existingIndex];
    if (
      existing.riderId === next.riderId &&
      existing.rssi === next.rssi &&
      existing.flags === next.flags
    ) {
      return list;
    }
    const copy = [...list];
    copy[existingIndex] = { ...existing, ...next };
    return copy;
  }
  return [...list, next];
};
