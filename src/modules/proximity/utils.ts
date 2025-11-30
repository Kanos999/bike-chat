import { RiderBeacon } from '../bluetooth/types';

export const upsertBeacon = (
  list: RiderBeacon[],
  next: RiderBeacon,
): RiderBeacon[] => {
  const existingIndex = list.findIndex((b) => b.riderId === next.riderId);
  if (existingIndex >= 0) {
    const copy = [...list];
    copy[existingIndex] = { ...copy[existingIndex], ...next };
    return copy;
  }
  return [...list, next];
};
